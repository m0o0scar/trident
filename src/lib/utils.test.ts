import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isImageFile } from './utils';

describe('isImageFile', () => {
  it('should return true for valid image extensions', () => {
    const validExtensions = [
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'icns', 'tiff', 'tif', 'webp', 'avif', 'heic', 'heif', 'svg'
    ];

    validExtensions.forEach((ext) => {
      assert.strictEqual(isImageFile(`image.${ext}`), true, `Expected .${ext} to be valid`);
    });
  });

  it('should return true for valid image extensions with uppercase', () => {
    assert.strictEqual(isImageFile('image.PNG'), true);
    assert.strictEqual(isImageFile('image.Jpg'), true);
  });

  it('should return false for invalid extensions', () => {
    const invalidExtensions = ['js', 'css', 'html', 'json', 'txt', 'md'];

    invalidExtensions.forEach((ext) => {
      assert.strictEqual(isImageFile(`file.${ext}`), false, `Expected .${ext} to be invalid`);
    });
  });

  it('should return false for files with no extension', () => {
    assert.strictEqual(isImageFile('README'), false);
    assert.strictEqual(isImageFile('makefile'), false);
  });

  it('should return false for empty file path', () => {
    assert.strictEqual(isImageFile(''), false);
  });

  it('should handle paths with directories', () => {
    assert.strictEqual(isImageFile('path/to/image.png'), true);
    assert.strictEqual(isImageFile('/absolute/path/to/image.jpg'), true);
    assert.strictEqual(isImageFile('folder/script.js'), false);
  });

  it('should handle edge cases', () => {
    // Hidden file logic: .png -> returns .png -> not in set -> false
    assert.strictEqual(isImageFile('.png'), false);

    // File ending in dot: image. -> returns "" -> not in set -> false
    assert.strictEqual(isImageFile('image.'), false);
  });
});
