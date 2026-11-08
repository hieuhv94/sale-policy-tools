/**
 * Phần dùng chung của hai script đi ĐƯỜNG API THẬT: `seed-demo.ts` (dữ liệu demo) và
 * `kiem-nghiem.ts` (kiểm nghiệm trên chồng kiểm, `0270`). Một bản, hai người gọi.
 */

/** Một tệp PDF một trang hợp lệ, chữ Latin — đủ để qua phép kiểm định dạng của `document`. */
export function pdfMau(dongChu: string): Buffer {
  const noi = `BT /F1 14 Tf 72 760 Td (${dongChu}) Tj ET`;
  const vat = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${noi.length} >>\nstream\n${noi}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let ra = '%PDF-1.4\n';
  const vt: number[] = [];
  vat.forEach((v, i) => {
    vt.push(ra.length);
    ra += `${i + 1} 0 obj\n${v}\nendobj\n`;
  });
  const xref = ra.length;
  ra += `xref\n0 ${vat.length + 1}\n0000000000 65535 f \n`;
  for (const o of vt) ra += `${String(o).padStart(10, '0')} 00000 n \n`;
  ra += `trailer\n<< /Size ${vat.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(ra, 'latin1');
}
