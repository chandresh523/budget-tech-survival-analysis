import html2canvas from 'html2canvas';

export async function extractPixelCoordinates(elementId, step = 4) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with id ${elementId} not found.`);
        return null;
    }

    // Create a safety timeout promise so it never hangs forever
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Pixel heist timed out')), 4000)
    );

    try {
        const captureTask = html2canvas(element, { 
            backgroundColor: null,
            logging: false,
            useCORS: true,
            scale: 0.8 // Lower scale speeds up rendering massively
        });

        const canvas = await Promise.race([captureTask, timeout]);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height).data;
        
        const positions = [];
        const colors = [];

        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const index = (y * width + x) * 4;
                const alpha = imageData[index + 3];
                
                if (alpha > 128) {
                    positions.push(x - (width / 2), -(y - (height / 2)), 0);
                    colors.push(
                        imageData[index] / 255,
                        imageData[index + 1] / 255,
                        imageData[index + 2] / 255
                    );
                }
            }
        }

        return { 
            positions: new Float32Array(positions), 
            colors: new Float32Array(colors) 
        };
    } catch (err) {
        console.warn("Pixel heist bypassed due to timeout or rendering block:", err);
        return null;
    }
}
