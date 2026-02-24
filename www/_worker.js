// noinspection JSUnresolvedReference

const VIDEO_EXT = ['.mp4', '.webm', '.mov'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

function getExt(pathname) {
  const dot = pathname.lastIndexOf('.');
  return dot !== -1 ? pathname.slice(dot).toLowerCase() : '';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ext = getExt(url.pathname);

    const isNav = request.headers.get('Sec-Fetch-Dest') === 'document';
    const hasRaw = url.searchParams.has('raw');

    // Intercept media file navigation under /artifacts/
    if (!hasRaw && isNav && url.pathname.startsWith('/artifacts/')) {
      let type = null;
      if (VIDEO_EXT.includes(ext)) type = 'video';
      else if (IMAGE_EXT.includes(ext)) type = 'image';

      if (type) {
        const viewerUrl = new URL('/viewer.html', url.origin);
        viewerUrl.searchParams.set('file', url.pathname);
        viewerUrl.searchParams.set('type', type);
        return Response.redirect(viewerUrl.toString(), 302);
      }
    }

    // Strip ?raw before passing to static assets
    if (hasRaw) {
      const clean = new URL(url);
      clean.searchParams.delete('raw');
      return env.ASSETS.fetch(new Request(clean, request));
    }

    return env.ASSETS.fetch(request);
  },
};