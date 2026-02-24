export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/dots-and-boxes' || url.pathname.startsWith('/dots-and-boxes/')) {
      const targetPath = url.pathname.replace(/^\/dots-and-boxes/, '') || '/';
      const targetUrl = `https://dots-and-boxes.orangely.xyz${targetPath}${url.search}`;
      return Response.redirect(targetUrl, 302);
    }

    return env.ASSETS.fetch(request);
  },
};
