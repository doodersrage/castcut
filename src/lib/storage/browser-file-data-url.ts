/** Browser-safe File → data URL (no Node Buffer / llm-client imports). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.startsWith('data:')) {
        resolve(result);
        return;
      }
      reject(new Error('Could not read image as a data URL.'));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read image file.'));
    };
    reader.readAsDataURL(file);
  });
}
