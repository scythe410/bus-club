// Exact byte sizes are required for HTTP ranges: the Assets binding can omit
// Content-Length on HEAD. tests/radio.test.mjs checks these against the originals.
export const RADIO_TRACKS = [
  {id: 'all-right', file: 'all-right-nonstop', title: 'All Right nonstop', fullTitle: 'all right nonstop alhene pal rakiddi', artist: 'Alhene pal rakiddi', duration: 532, bytes: 12770253},
  {id: 'jothi', file: 'jothi-nonstop', title: 'Jothi nonstop', fullTitle: 'ජෝති නන්ස්ටොප් හොඳම එක සැපම එක JOගෙන් Thushara Jo Jothi nonstop Sahara Flash @ Hanwella', artist: 'Thushara Jo · Sahara Flash', duration: 396, bytes: 9519575},
];
