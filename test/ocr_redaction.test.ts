import fs from 'fs';
import path from 'path';
import { performOCRAndRedact } from '../src/services/ocr_service';
import axios from 'axios';


describe('OCR and Redaction Logic', () => {
    jest.mock('axios');

    it('should process the image and return a redacted image', async () => {
        const mockRedactedImage = Buffer.from('redacted data').toString('base64');
      
        (axios.post as jest.Mock).mockResolvedValue({
          data: { redacted_image: mockRedactedImage }
        });
      
        const result = await performOCRAndRedact(Buffer.from('test image'));
      
        expect(result.toString()).toBe('redacted data');
//       });
//   it('should process the image and return a redacted image', async () => {
//     // Load the test image
//     const imagePath = path.resolve(__dirname, 'image.png');
//     const imageBuffer = fs.readFileSync(imagePath);

//     // Perform OCR and redaction
//     const redactedImageBuffer = await performOCRAndRedact(imageBuffer);

//     // Save the output for inspection
//     const outputPath = path.resolve(__dirname, 'output.png');
//     fs.writeFileSync(outputPath, redactedImageBuffer);

//     // Check that the output file exists and is not empty
//     expect(fs.existsSync(outputPath)).toBe(true);
//     expect(redactedImageBuffer.length).toBeGreaterThan(0);
  });
});