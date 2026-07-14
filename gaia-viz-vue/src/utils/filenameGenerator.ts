export const generateFilename = (
  prefix: string,
  selectedCountryCode: string,
  extension?: string,
): string => {
  const now = new Date();

  const pad = (n: number) => n.toString().padStart(2, "0");

  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const timestamp = `${date}_${time}`;

  if (extension) {
    return `${selectedCountryCode}_${prefix}__${timestamp}.${extension}`;
  }
  return `${selectedCountryCode}_${prefix}_${timestamp}`;
};