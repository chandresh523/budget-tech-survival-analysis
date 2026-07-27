import html2canvas from 'html2canvas';

/**
 * Extracts 3D coordinates from a DOM element's pixels.
 * @param {HTMLElement} element - The DOM node to scan.
 * @param {number} stride - How many pixels to skip. (e.g., 4 = 1 particle per 4x4 pixel grid).
 */
export async function extractPixels(element, stride = 4) {
  // 1. Force the browser to draw the DOM node to a hidden canvas
  const canvas = await html2canvas(element, {
    backgroundColor: null, // Ignore background so we only get the UI elements
    scale: 1, // Keep it 1:1 scale to avoid memory bloat on Retina displays
  });

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const width = canvas.width;
  const height = canvas.height;
  
  // 2. Extract the raw pixel data array [r, g, b, a, r, g, b, a...]
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const particles = [];

  // 3. Loop through the pixels, jumping by the 'stride' amount to optimize count
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      const alpha = imageData[index + 3];

      // 4. If the pixel has color (isn't completely transparent), steal its coordinates
      if (alpha > 10) {
        particles.push({
          // Center the X/Y coordinates around 0,0 for WebGL
          x: x - width / 2,
          // Flip the Y-axis (DOM reads top-to-bottom, WebGL reads bottom-to-top)
          y: -(y - height / 2),
          z: 0 
        });
      }
    }
  }

  console.log(`Heist Complete: Extracted ${particles.length} particles.`);
  return particles;
}
