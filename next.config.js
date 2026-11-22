/** @type {import('next').NextConfig} */
module.exports = {
  async redirects() {
    return [
      // The cinematic cut was promoted from /cinematic to the root, because
      // nothing linked to it and visitors only ever saw the story cut. Anything
      // already pointing at the old path keeps working. 307, not 308: a
      // permanent redirect gets cached hard by browsers and would be painful to
      // undo if the routing changes again.
      { source: '/cinematic', destination: '/', permanent: false },
    ];
  },
};
