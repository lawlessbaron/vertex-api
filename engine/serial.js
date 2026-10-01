// The serial number of the download being made. The server hands one out each
// time a download is allowed (track('download')), and the exporters stamp it
// into the file, so any file can be traced back to when and how it was made.
let current = '';
export const setSerial = (s) => { current = /^VX-[0-9A-Z-]{6,24}$/.test(String(s || '')) ? String(s) : ''; };
export const currentSerial = () => current;
