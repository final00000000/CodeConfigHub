const https = require('https');
const { app, net, session } = require('electron');

const MAX_REDIRECTS = 5;
const ELECTRON_NET_UNAVAILABLE = 'ELECTRON_NET_UNAVAILABLE';

function getUserAgent() {
  const version = typeof app?.getVersion === 'function' ? app.getVersion() : 'unknown';
  return `CodeConfigHub/${version}`;
}

function normalizeKnownNetworkMessage(message = '') {
  const normalized = String(message || '').trim();

  if (!normalized) {
    return '';
  }

  if (/Client network socket disconnected before secure TLS connection was established/i.test(normalized)) {
    return 'TLS 握手失败，通常与系统代理、证书链或安全软件拦截有关。';
  }

  if (/ERR_CERT|certificate/i.test(normalized)) {
    return '证书校验失败，可能与系统证书、代理或网络中间层有关。';
  }

  if (/ECONNRESET|socket hang up/i.test(normalized)) {
    return '连接被中断，可能是代理、网络波动或网关重置导致。';
  }

  if (/ETIMEDOUT|timed out|timeout/i.test(normalized)) {
    return '连接超时，请稍后重试。';
  }

  return normalized;
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    const code = typeof error.code === 'string' && error.code ? error.code : '';
    const message = normalizeKnownNetworkMessage(error.message);

    if (code && message && !message.includes(code)) {
      return `${message} (${code})`;
    }

    return message;
  }

  return normalizeKnownNetworkMessage(String(error));
}

function createElectronNetUnavailableError(message = 'Electron Chromium 网络栈不可用。') {
  const error = new Error(message);
  error.code = ELECTRON_NET_UNAVAILABLE;
  return error;
}

function isElectronNetUnavailableError(error) {
  return Boolean(error && typeof error === 'object' && error.code === ELECTRON_NET_UNAVAILABLE);
}

function createNetworkError(errorPrefix, error, details = []) {
  const messageParts = details.filter(Boolean);
  const detailMessage = getErrorMessage(error);

  if (detailMessage) {
    messageParts.push(detailMessage);
  }

  return new Error(messageParts.length > 0 ? `${errorPrefix} 失败：${messageParts.join('；')}` : `${errorPrefix} 失败。`);
}

function parseJsonResponse(body, errorPrefix) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${errorPrefix} JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchJsonViaElectronNet(url, { timeoutMs, maxBytes, errorPrefix }) {
  if (!app?.whenReady || !net?.request || !session) {
    throw createElectronNetUnavailableError();
  }

  await app.whenReady();

  if (!session.defaultSession) {
    throw createElectronNetUnavailableError('Electron 默认会话不可用。');
  }

  const electronSession = session.defaultSession;
  const proxyDescriptionPromise = electronSession.resolveProxy(url)
    .then((value) => (value && value !== 'DIRECT' ? value : ''))
    .catch(() => '');

  return new Promise((resolve, reject) => {
    let finished = false;
    let redirectCount = 0;
    let currentUrl = url;

    const request = net.request({
      method: 'GET',
      url,
      session: electronSession,
      redirect: 'manual',
      cache: 'reload',
      headers: {
        'User-Agent': getUserAgent(),
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8'
      }
    });

    const cleanup = () => {
      clearTimeout(timeoutId);
    };

    const fail = (error) => {
      if (finished) {
        return;
      }

      finished = true;
      cleanup();
      reject(error);
    };

    const failNetwork = (error) => {
      if (finished) {
        return;
      }

      finished = true;
      cleanup();

      proxyDescriptionPromise
        .then((proxyDescription) => {
          reject(createNetworkError(errorPrefix, error, [
            currentUrl ? `URL ${currentUrl}` : '',
            proxyDescription ? `代理 ${proxyDescription}` : ''
          ]));
        })
        .catch(() => {
          reject(createNetworkError(errorPrefix, error, [
            currentUrl ? `URL ${currentUrl}` : ''
          ]));
        });
    };

    const succeed = (payload) => {
      if (finished) {
        return;
      }

      finished = true;
      cleanup();
      resolve(payload);
    };

    const timeoutId = setTimeout(() => {
      fail(new Error(`${errorPrefix} 超时，请稍后重试。`));
      request.abort();
    }, timeoutMs);

    request.on('redirect', (_statusCode, _method, redirectUrl) => {
      currentUrl = redirectUrl || currentUrl;
      redirectCount += 1;

      if (redirectCount > MAX_REDIRECTS) {
        fail(new Error(`${errorPrefix} 重定向次数过多（最后 URL ${currentUrl}）。`));
        request.abort();
        return;
      }

      request.followRedirect();
    });

    request.on('response', (response) => {
      const { statusCode = 0 } = response;

      if (statusCode < 200 || statusCode >= 300) {
        response.resume?.();
        fail(new Error(`${errorPrefix} 请求失败（HTTP ${statusCode}）。`));
        return;
      }

      const chunks = [];
      let bodyBytes = 0;

      response.on('data', (chunk) => {
        if (finished) {
          return;
        }

        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bodyBytes += bufferChunk.length;

        if (bodyBytes > maxBytes) {
          fail(new Error(`${errorPrefix} 响应过大，已中止读取。`));
          request.abort();
          return;
        }

        chunks.push(bufferChunk);
      });

      response.on('end', () => {
        if (finished) {
          return;
        }

        try {
          const body = Buffer.concat(chunks).toString('utf8');
          succeed(parseJsonResponse(body, errorPrefix));
        } catch (error) {
          fail(error);
        }
      });

      response.on('aborted', () => {
        fail(new Error(`${errorPrefix} 连接被中断。`));
      });

      response.on('error', (error) => {
        failNetwork(error);
      });
    });

    request.on('error', (error) => {
      failNetwork(error);
    });

    request.end();
  });
}

function fetchJsonViaHttps(url, { timeoutMs, maxBytes, errorPrefix }, redirectCount = 0, family = undefined) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const request = https.get(url, {
      family,
      headers: {
        'User-Agent': getUserAgent(),
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8'
      }
    }, (response) => {
      const { statusCode = 0, headers } = response;

      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`${errorPrefix} 重定向次数过多。`));
          return;
        }

        const nextUrl = new URL(headers.location, url).toString();
        resolve(fetchJsonViaHttps(nextUrl, { timeoutMs, maxBytes, errorPrefix }, redirectCount + 1, family));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`${errorPrefix} 请求失败（HTTP ${statusCode}）。`));
        return;
      }

      response.setEncoding('utf8');
      let body = '';
      let bodyBytes = 0;

      response.on('data', (chunk) => {
        if (finished) {
          return;
        }

        body += chunk;
        bodyBytes += Buffer.byteLength(chunk, 'utf8');

        if (bodyBytes > maxBytes) {
          finished = true;
          request.destroy(new Error(`${errorPrefix} 响应过大，已中止读取。`));
        }
      });

      response.on('end', () => {
        if (finished) {
          return;
        }

        finished = true;
        try {
          resolve(parseJsonResponse(body, errorPrefix));
        } catch (error) {
          reject(error);
        }
      });

      response.on('error', (error) => {
        if (finished) {
          return;
        }

        finished = true;
        reject(error);
      });
    });

    request.setTimeout(timeoutMs, () => {
      if (finished) {
        return;
      }

      finished = true;
      request.destroy(new Error(`${errorPrefix} 超时，请稍后重试。`));
    });

    request.on('error', (error) => {
      if (finished) {
        return;
      }

      finished = true;
      reject(error);
    });
  });
}

async function fetchJsonWithFallback(url, options) {
  try {
    return await fetchJsonViaElectronNet(url, options);
  } catch (error) {
    if (!isElectronNetUnavailableError(error)) {
      throw error;
    }

    return fetchJsonViaHttps(url, options);
  }
}

module.exports = {
  fetchJsonWithFallback
};
