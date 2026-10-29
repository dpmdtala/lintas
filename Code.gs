/**
 * LINTAS DPMD — Layanan Integrasi Tata Administrasi Surat
 * Versi awal: pencatatan surat masuk/keluar, arsip Kartu Kendali,
 * unggah scan privat ke Google Drive, pencarian, dan cetak formulir.
 *
 * PEMASANGAN:
 * 1. Buat project Google Apps Script menggunakan akun dpmd.sakti@gmail.com.
 * 2. Tempel Code.gs dan Index.html.
 * 3. Jalankan setupLintas() satu kali dari editor, lalu izinkan akses.
 * 4. Deploy sebagai Web app. Untuk penggunaan internal, atur akses deployment
 *    secara hati-hati dan uji identitas pengguna sebelum dipakai operasional.
 */
const LINTAS = {
  APP_NAME: 'LINTAS DPMD',
  OWNER_EMAIL: 'dpmd.sakti@gmail.com',
  TZ: 'Asia/Makassar',
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  SHEETS: {
    CONFIG: 'Konfigurasi',
    INCOMING: 'Surat_Masuk',
    OUTGOING: 'Surat_Keluar',
    ARCHIVE: 'Arsip_Kartu_Kendali',
    AUDIT: 'Log_Aktivitas',
    OFFICIALS: 'Status_Pejabat',
    VISITORS: 'Buku_Tamu_Elektronik',
    IKM: 'Survei_IKM'
  },
  HEADERS: {
    Konfigurasi: ['Kunci', 'Nilai'],
    Surat_Masuk: [
      'ID_Surat','Nomor_Registrasi','Nomor_Urut_Kartu','Tanggal_Diterima',
      'Waktu_Diterima','Tanggal_Surat','Nomor_Surat','Asal_Surat','Perihal',
      'Isi_Ringkas','Jumlah_Lampiran','Sifat_Surat','Pengolah','Tanggal_Diteruskan',
      'Tanda_Terima','Catatan','File_Scan_ID','File_Scan_Nama','File_Scan_Mime',
      'Status','Petugas_Pencatat','Dibuat_Pada','Diperbarui_Pada','Client_Request_ID'
    ],
    Surat_Keluar: [
      'ID_Surat','Nomor_Agenda_Internal','Tanggal_Dicatat','Waktu_Dicatat',
      'Tanggal_Surat_Resmi','Nomor_Surat_Resmi','Tujuan_Surat','Perihal',
      'Sifat_Surat','Jumlah_Lampiran','Catatan','File_Scan_ID','File_Scan_Nama',
      'File_Scan_Mime','Petugas_Pencatat','Dibuat_Pada','Diperbarui_Pada','Client_Request_ID'
    ],
    Arsip_Kartu_Kendali: [
      'ID_Surat','Nomor_Registrasi','Nomor_Urut_Kartu','Indeks','Kode',
      'Tanggal_Diterima','Waktu_Diterima','Asal_Surat','Nomor_Surat',
      'Tanggal_Surat','Perihal','Isi_Ringkas','Jumlah_Lampiran','Pengolah',
      'Tanggal_Diteruskan','Tanda_Terima','Catatan','File_Scan_ID',
      'File_Scan_Nama','Status_Verifikasi','Dibuat_Pada','Diperbarui_Pada'
    ],
    Log_Aktivitas: ['Timestamp','Aktor','Aksi','Jenis_Surat','ID_Surat','Detail'],
    Status_Pejabat: ['ID_Pejabat','Jabatan','Nama','NIP','Status_Hari_Ini','Diperbarui_Pada','Diperbarui_Oleh'],
    Buku_Tamu_Elektronik: ['ID_Tamu','Timestamp','Nama_Tamu','Instansi','Nomor_HP','Tujuan_Kunjungan','Pejabat_Dituju','Waktu_Datang','Waktu_Pulang','Catatan'],
    Survei_IKM: ['ID_Survei','Timestamp','Jenis_Layanan','Tanggal_Layanan','Kecepatan','Kemudahan','Kesopanan','Kepuasan','Saran','Nama_Responden','Instansi','Usia','Jenis_Kelamin','Pendidikan_Terakhir','Persyaratan_Pelayanan','Prosedur_Pelayanan','Waktu_Penyelesaian','Biaya_Tarif','Produk_Layanan','Kompetensi_Pelaksana','Perilaku_Pelaksana','Sarana_Prasarana','Penanganan_Pengaduan'],
    Kepuasan_Layanan: ['ID_Respons','Timestamp','Jenis_Layanan','Tanggal_Layanan','Petugas_Layanan','Kecepatan_Layanan','Kemudahan_Layanan','Keramahan_Petugas','Kualitas_Layanan','Kepuasan_Akhir','Saran','Sumber_Link']
  }
};


function doGet(e) {
  const page = e && e.parameter
    ? e.parameter.page
    : '';

  // BRIDGE: jembatan postMessage untuk frontend GitHub Pages.
  // ALLOWALL diperlukan agar halaman bridge dapat dimuat di iframe GitHub Pages.
  // Keamanan tetap harus ditegakkan di Bridge.html (origin + allowlist fungsi)
  // dan setiap fungsi backend tetap memvalidasi token/role melalui requireSession_.
  if (page === 'bridge') {
    return HtmlService.createHtmlOutputFromFile('Bridge')
      .setTitle('LINTAS API Bridge')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // RUTE LAMA: PERTAHANKAN KODE ASLI ANDA
 if (page === 'guest') return HtmlService.createHtmlOutput(publicGuestFormHtml_())
    .setTitle('Buku Tamu Elektronik — DPMD Kabupaten Tanah Laut')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  if (page === 'ikm') return HtmlService.createHtmlOutput(publicIkmFormHtml_())
    .setTitle('Survei Kepuasan Masyarakat — DPMD Kabupaten Tanah Laut')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  // Pertahankan return halaman utama dan rute lainnya.
 return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(LINTAS.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function publicGuestFormHtml_() {
  const now = new Date();
  const today = Utilities.formatDate(now, LINTAS.TZ, 'yyyy-MM-dd');
  const clock = Utilities.formatDate(now, LINTAS.TZ, 'HH:mm:ss');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{font-family:Arial,sans-serif;color:#172b45;background:#f3f6fa}body{margin:0;padding:18px}.wrap{max-width:720px;margin:18px auto;background:#fff;border-radius:16px;padding:26px;box-shadow:0 8px 28px #10254418}h1{font-size:24px;margin:0 0 6px;color:#102544}.sub{color:#64748b;margin-bottom:22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;flex-direction:column;gap:6px}.full{grid-column:1/-1}label{font-size:14px;font-weight:700}input,select,textarea{font:inherit;padding:11px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;width:100%}button{margin-top:18px;border:0;border-radius:8px;background:#102544;color:#fff;font-weight:700;padding:13px 18px;cursor:pointer;width:100%}.notice{margin-top:14px;padding:12px;border-radius:8px;background:#e8f8ef;color:#166534}.err{background:#fff0f0;color:#991b1b}.required{color:#b91c1c}@media(max-width:560px){.grid{grid-template-columns:1fr}.full{grid-column:auto}.wrap{padding:18px}}
  </style></head><body><main class="wrap"><h1>Buku Tamu Elektronik</h1><div class="sub">Dinas Pemberdayaan Masyarakat dan Desa Kabupaten Tanah Laut</div><form id="guestForm"><div class="grid">
  <div class="field"><label>Nama lengkap <span class="required">*</span></label><input name="nama" maxlength="150" required autocomplete="name"></div><div class="field"><label>Instansi / alamat <span class="required">*</span></label><input name="instansi" maxlength="180" required></div><div class="field"><label>Nomor HP <span class="required">*</span></label><input name="hp" maxlength="30" inputmode="tel" autocomplete="tel" required></div><div class="field"><label>Tanggal kunjungan</label><input type="date" value="${today}" readonly aria-readonly="true"></div><div class="field"><label>Waktu saat membuka formulir (WITA)</label><input type="text" value="${clock}" readonly aria-readonly="true"></div><div class="field"><label>Pejabat / bagian yang dituju <span class="required">*</span></label><input name="pejabat" maxlength="180" required></div><div class="field full"><label>Tujuan kunjungan <span class="required">*</span></label><textarea name="tujuan" maxlength="1000" rows="3" required></textarea></div><div class="field full"><label>Catatan (opsional)</label><textarea name="catatan" maxlength="1000" rows="2"></textarea></div></div><button id="submitBtn" type="submit">Kirim Data Kunjungan</button><div id="result" role="status" aria-live="polite"></div></form></main>
  <script>document.getElementById('guestForm').addEventListener('submit',function(ev){ev.preventDefault();var f=ev.target,b=document.getElementById('submitBtn'),r=document.getElementById('result');if(b.disabled)return;b.disabled=true;b.textContent='Mengirim…';r.className='';r.textContent='';var d={nama:f.elements.nama.value,instansi:f.elements.instansi.value,hp:f.elements.hp.value,pejabat:f.elements.pejabat.value,tujuan:f.elements.tujuan.value,catatan:f.elements.catatan.value};google.script.run.withSuccessHandler(function(x){b.disabled=false;b.textContent='Kirim Data Kunjungan';r.className='notice';r.textContent='Terima kasih. Data kunjungan berhasil dicatat. Nomor tamu: '+x.id;f.reset();}).withFailureHandler(function(e){b.disabled=false;b.textContent='Kirim Data Kunjungan';r.className='notice err';r.textContent=(e&&e.message)||'Data belum berhasil dikirim. Silakan coba kembali.';}).savePublicVisitor(d);});</script></body></html>`;
}
function getPublicPageUrl(page) {
  const p = String(page || '').toLowerCase();
  if (!['guest', 'ikm'].includes(p)) throw new Error('Jenis halaman publik tidak dikenal.');
  const base = ScriptApp.getService().getUrl();
  if (!base) throw new Error('URL Web App belum tersedia. Deploy aplikasi sebagai Web App terlebih dahulu.');
  return {url: base + '?page=' + encodeURIComponent(p)};
}

function getPublicGuestInfo(token) { requireSession_(token, ['FRONT_OFFICE']); return {url:ScriptApp.getService().getUrl()+'?page=guest'}; }
function savePublicVisitor(payload) {
  if (!payload) throw new Error('Data formulir tidak ditemukan.');
  const nama=clean_(payload.nama),instansi=clean_(payload.instansi),tujuan=clean_(payload.tujuan),pejabat=clean_(payload.pejabat);
  const hp=clean_(payload.hp);if(!nama||!instansi||!hp||!tujuan||!pejabat)throw new Error('Nama, instansi/alamat, nomor HP, tujuan kunjungan, dan pejabat/bagian yang dituju wajib diisi.');
  if(nama.length>150||instansi.length>180||tujuan.length>1000||pejabat.length>180)throw new Error('Ada isian yang melebihi batas karakter.');
  const ss=getDb_();let sh=ss.getSheetByName(LINTAS.SHEETS.VISITORS);if(!sh){sh=ss.insertSheet(LINTAS.SHEETS.VISITORS);sh.appendRow(LINTAS.HEADERS.Buku_Tamu_Elektronik);}
  const id='TAMU-'+Utilities.formatDate(new Date(),LINTAS.TZ,'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,6).toUpperCase(),now=new Date();
  sh.appendRow([id,now,nama,instansi,hp.slice(0,30),tujuan,pejabat,Utilities.formatDate(now,LINTAS.TZ,'HH:mm:ss'),' ',clean_(payload.catatan).slice(0,1000)]);return {ok:true,id:id};
}
function listVisitorsForFrontOffice(token) { requireSession_(token,['FRONT_OFFICE']);const sh=getDb_().getSheetByName(LINTAS.SHEETS.VISITORS);if(!sh||sh.getLastRow()<2)return [];return rowsAsObjects_(sh).slice(-500).reverse().map(r=>({id:clean_(r.ID_Tamu),timestamp:r.Timestamp instanceof Date?Utilities.formatDate(r.Timestamp,LINTAS.TZ,'dd:MM:yyyy HH:mm:ss')+' WITA':clean_(r.Timestamp),nama:clean_(r.Nama_Tamu),instansi:clean_(r.Instansi),hp:clean_(r.Nomor_HP),tujuan:clean_(r.Tujuan_Kunjungan),pejabat:clean_(r.Pejabat_Dituju),waktu:clean_(r.Waktu_Datang)}));}
function getPublicIkmInfo(token) { requireSession_(token,['FRONT_OFFICE']);return {url:ScriptApp.getService().getUrl()+'?page=ikm'}; }
function publicIkmFormHtml_() {
 const periodLabel = getCurrentIkmPeriodLabel_();
 const options = {layanan:['Pelayanan Surat Masuk/Keluar','Pelayanan Audensi Sesuai Keperluan','Pelayanan Permohonan Informasi Publik','Evaluasi Kerjasama Antar Desa','Proses Pencarian Hibah/Bansos','Konsultasi dan Fasilitasi Produk Hukum Desa','Pelayanan Administrasi Keuangan Desa/SISKEUDES','Pemantauan, Evaluasi dan Pelaporan Kelompok Kerja Operasional Posyandu','Persetujuan Lembaga/Kelompok Kelembagaan Masyarakat','Koordinasi Terkait Pelaksanaan Desa Mandiri','Koordinasi Terkait Profil Desa','Lainnya'],jk:['Laki - Laki','Perempuan'],pendidikan:['Tidak Sekolah','SD/MI','SMP/SLTP/MTs','SMA/SLTA/MA','D1/D2','D3','S1/D4','PASCA SARJANA (S2/S3)'],persyaratan:['Tidak Sesuai','Kurang Sesuai','Sesuai','Sangat Sesuai'],prosedur:['Tidak Mudah','Kurang Mudah','Mudah','Sangat Mudah'],waktu:['Tidak Cepat','Kurang Cepat','Cepat','Sangat Cepat'],biaya:['Sangat Mahal','Cukup Mahal','Murah','Gratis'],produk:['Tidak Sesuai','Kurang Sesuai','Sesuai','Sangat Sesuai'],kompetensi:['Tidak Kompeten','Kurang Kompeten','Kompeten','Sangat Kompeten'],perilaku:['Tidak Sopan','Kurang Sopan dan Ramah','Sopan dan Ramah','Sangat Sopan dan Ramah'],sarana:['Buruk','Cukup','Baik','Sangat Baik'],pengaduan:['Tidak Ada','Ada tetapi tidak berfungsi','Berfungsi kurang maksimal','Dikelola dengan baik']};
 const select=(name,label,arr,required=true)=>`<div class="field"><label>${label}${required?' *':''}</label><select name="${name}" ${required?'required':''}><option value="">Pilih jawaban</option>${arr.map(v=>`<option>${v}</option>`).join('')}</select></div>`;
 return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#f3f6fa;color:#172b45;font:15px Arial}.wrap{max-width:850px;margin:auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 28px #10254418}h1{color:#102544;margin-bottom:6px}.sub{color:#64748b;line-height:1.5;margin-bottom:20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;flex-direction:column;gap:6px}.full{grid-column:1/-1}label{font-weight:700;font-size:14px}input,select,textarea{font:inherit;padding:11px;border:1px solid #cbd5e1;border-radius:8px;width:100%;box-sizing:border-box}button{background:#102544;color:white;border:0;border-radius:8px;padding:13px 18px;font-weight:700;width:100%;margin-top:20px}.notice{padding:12px;border-radius:8px;background:#e8f8ef;color:#166534;margin-top:14px}.err{background:#fff0f0;color:#991b1b}.section{grid-column:1/-1;border-bottom:1px solid #e2e8f0;padding:10px 0 4px;color:#9a6a16;font-weight:bold;margin-top:8px}@media(max-width:600px){.grid{grid-template-columns:1fr}.full,.section{grid-column:auto}.wrap{padding:17px}}</style></head><body><main class="wrap"><h1>Survei Indeks Kepuasan Masyarakat Tahun ${Utilities.formatDate(new Date(),LINTAS.TZ,'yyyy')}</h1><div class="sub"><b>Dinas Pemberdayaan Masyarakat dan Desa Kabupaten Tanah Laut</b><br>Penilaian ${periodLabel}. Survei ini didasarkan pada Pedoman Menteri Pendayagunaan Aparatur Negara dan Reformasi Birokrasi Nomor 9 Tahun 2024 tentang Pelaksanaan Survei Kepuasan Masyarakat Secara Daring. Mohon isi sesuai pengalaman pelayanan Anda. Jawaban tidak memengaruhi pelayanan yang diterima.<br><br><b><i>Semua data yang diberikan bersifat rahasia, hasil survei hanya akan digunakan sebagai bahan evaluasi pelayanan kami, terima kasih.</i></b></div><form id="ikmForm"><div class="grid"><div class="section">IDENTITAS RESPONDEN</div><div class="field"><label>1. Nama Responden *</label><input name="nama" maxlength="150" required></div><div class="field"><label>2. Instansi/Tempat Bekerja *</label><input name="instansi" maxlength="180" required></div><div class="field"><label>3. Usia *</label><input name="usia" type="number" min="1" max="120" required></div>${select('jk','4. Jenis Kelamin',options.jk)}${select('pendidikan','5. Pendidikan Terakhir',options.pendidikan)}<div class="field full">${select('layanan','6. Jenis layanan yang diterima',options.layanan)}</div><div class="section">PENILAIAN PELAYANAN</div>${select('persyaratan','7. Persyaratan Pelayanan',options.persyaratan)}${select('prosedur','8. Prosedur Pelayanan',options.prosedur)}${select('waktu','9. Waktu Penyelesaian',options.waktu)}${select('biaya','10. Biaya/Tarif',options.biaya)}${select('produk','11. Produk Spesifikasi Jenis Pelayanan',options.produk)}${select('kompetensi','12. Kompetensi Pelaksana',options.kompetensi)}${select('perilaku','13. Perilaku Pelaksana',options.perilaku)}${select('sarana','14. Sarana dan Prasarana',options.sarana)}${select('pengaduan','15. Penanganan Pengaduan, Saran dan Masukan',options.pengaduan)}<div class="section">SARAN DAN MASUKAN</div><div class="field full"><label>16. Saran dan Masukan serta Jenis Pelayanan yang belum memuaskan</label><textarea name="saran" rows="4" maxlength="2000" placeholder="Tuliskan saran atau masukan"></textarea></div></div><button id="send" type="submit">Kirim Jawaban SKM</button><div id="result" aria-live="polite"></div></form></main><script>document.getElementById('ikmForm').addEventListener('submit',function(ev){ev.preventDefault();const f=ev.target,b=document.getElementById('send'),r=document.getElementById('result');if(b.disabled)return;b.disabled=true;b.textContent='Mengirim…';const d={};new FormData(f).forEach((v,k)=>d[k]=v);google.script.run.withSuccessHandler(x=>{b.disabled=false;b.textContent='Kirim Jawaban SKM';r.className='notice';r.textContent='Terima kasih. Jawaban SKM berhasil direkam.';f.reset();}).withFailureHandler(e=>{b.disabled=false;b.textContent='Kirim Jawaban SKM';r.className='notice err';r.textContent=(e&&e.message)||'Jawaban belum berhasil dikirim. Silakan coba kembali.';}).savePublicIkm(d);});</script></body></html>`;
}
function savePublicIkm(p) {
 if(!p)throw new Error('Data survei tidak ditemukan.');const required=['nama','instansi','usia','jk','pendidikan','layanan','persyaratan','prosedur','waktu','biaya','produk','kompetensi','perilaku','sarana','pengaduan'];for(const k of required)if(!clean_(p[k]))throw new Error('Mohon lengkapi seluruh pertanyaan wajib.');
 const ss=getDb_();let sh=ss.getSheetByName(LINTAS.SHEETS.IKM);if(!sh){sh=ss.insertSheet(LINTAS.SHEETS.IKM);sh.appendRow(LINTAS.HEADERS.Survei_IKM);}
 const existing=sh.getLastColumn()?sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim()):[];const headers=LINTAS.HEADERS.Survei_IKM;const missing=headers.filter(x=>!existing.includes(x));if(missing.length){sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);}
 const allHeaders=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim());const now=new Date();const map={ID_Survei:'SKM-'+Utilities.formatDate(now,LINTAS.TZ,'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,6).toUpperCase(),Timestamp:now,Jenis_Layanan:clean_(p.layanan),Tanggal_Layanan:Utilities.formatDate(now,LINTAS.TZ,'yyyy-MM-dd'),Kecepatan:clean_(p.waktu),Kemudahan:clean_(p.prosedur),Kesopanan:clean_(p.perilaku),Kepuasan:clean_(p.sarana),Saran:clean_(p.saran).slice(0,2000),Nama_Responden:clean_(p.nama).slice(0,150),Instansi:clean_(p.instansi).slice(0,180),Usia:clean_(p.usia),Jenis_Kelamin:clean_(p.jk),Pendidikan_Terakhir:clean_(p.pendidikan),Persyaratan_Pelayanan:clean_(p.persyaratan),Prosedur_Pelayanan:clean_(p.prosedur),Waktu_Penyelesaian:clean_(p.waktu),Biaya_Tarif:clean_(p.biaya),Produk_Layanan:clean_(p.produk),Kompetensi_Pelaksana:clean_(p.kompetensi),Perilaku_Pelaksana:clean_(p.perilaku),Sarana_Prasarana:clean_(p.sarana),Penanganan_Pengaduan:clean_(p.pengaduan)};sh.appendRow(allHeaders.map(k=>Object.prototype.hasOwnProperty.call(map,k)?map[k]:''));return {ok:true};
}
function listIkmForFrontOffice(token){requireSession_(token,['FRONT_OFFICE']);const sh=getDb_().getSheetByName(LINTAS.SHEETS.IKM);if(!sh||sh.getLastRow()<2)return [];return rowsAsObjects_(sh).slice(-500).reverse().filter(r=>clean_(r.ID_Survei)).map(r=>({timestamp:r.Timestamp instanceof Date?Utilities.formatDate(r.Timestamp,LINTAS.TZ,'dd:MM:yyyy HH:mm:ss')+' WITA':clean_(r.Timestamp),nama:clean_(r.Nama_Responden),instansi:clean_(r.Instansi),layanan:clean_(r.Jenis_Layanan),nilai:[r.Persyaratan_Pelayanan,r.Prosedur_Pelayanan,r.Waktu_Penyelesaian,r.Biaya_Tarif,r.Produk_Layanan,r.Kompetensi_Pelaksana,r.Perilaku_Pelaksana,r.Sarana_Prasarana,r.Penanganan_Pengaduan].filter(Boolean).join(' | '),saran:clean_(r.Saran)}));}


function getCurrentIkmPeriod_() {
  const now = new Date();
  const month = Number(Utilities.formatDate(now, LINTAS.TZ, 'M'));
  return {quarter: Math.floor((month - 1) / 3) + 1, year: Number(Utilities.formatDate(now, LINTAS.TZ, 'yyyy'))};
}
function getCurrentIkmPeriodLabel_() {
  const p = getCurrentIkmPeriod_();
  return 'Triwulan ' + ['I','II','III','IV'][p.quarter-1] + ' Tahun ' + p.year;
}
function getIkmQuarterlyReport(period, token) {
  requireSession_(token, ['FRONT_OFFICE']);
  period = period || {};
  const current = getCurrentIkmPeriod_();
  const quarter = Math.min(4, Math.max(1, Number(period.quarter || current.quarter)));
  const year = Math.max(2020, Math.min(current.year, Number(period.year || current.year)));
  const label = 'Triwulan ' + ['I','II','III','IV'][quarter-1] + ' Tahun ' + year;
  const sh = getDb_().getSheetByName(LINTAS.SHEETS.IKM);
  if (!sh || sh.getLastRow() < 2) return {periodLabel:label,quarter:quarter,year:year,records:[]};
  const startMonth=(quarter-1)*3+1, endMonth=startMonth+2;
  const records=rowsAsObjects_(sh).filter(r=>{
    if(!clean_(r.ID_Survei))return false;
    const d=r.Timestamp instanceof Date?r.Timestamp:new Date(r.Timestamp);
    if(isNaN(d.getTime()))return false;
    const ym=Number(Utilities.formatDate(d,LINTAS.TZ,'yyyy')),mm=Number(Utilities.formatDate(d,LINTAS.TZ,'M'));
    return ym===year&&mm>=startMonth&&mm<=endMonth;
  }).map(r=>({timestamp:r.Timestamp instanceof Date?Utilities.formatDate(r.Timestamp,LINTAS.TZ,'dd/MM/yyyy HH:mm:ss')+' WITA':clean_(r.Timestamp),nama:clean_(r.Nama_Responden),instansi:clean_(r.Instansi),layanan:clean_(r.Jenis_Layanan),scores:[
    scoreIkm_(r.Persyaratan_Pelayanan,['Tidak Sesuai','Kurang Sesuai','Sesuai','Sangat Sesuai']),
    scoreIkm_(r.Prosedur_Pelayanan,['Tidak Mudah','Kurang Mudah','Mudah','Sangat Mudah']),
    scoreIkm_(r.Waktu_Penyelesaian,['Tidak Cepat','Kurang Cepat','Cepat','Sangat Cepat']),
    scoreIkm_(r.Biaya_Tarif,['Sangat Mahal','Cukup Mahal','Murah','Gratis']),
    scoreIkm_(r.Produk_Layanan,['Tidak Sesuai','Kurang Sesuai','Sesuai','Sangat Sesuai']),
    scoreIkm_(r.Kompetensi_Pelaksana,['Tidak Kompeten','Kurang Kompeten','Kompeten','Sangat Kompeten']),
    scoreIkm_(r.Perilaku_Pelaksana,['Tidak Sopan','Kurang Sopan dan Ramah','Sopan dan Ramah','Sangat Sopan dan Ramah']),
    scoreIkm_(r.Sarana_Prasarana,['Buruk','Cukup','Baik','Sangat Baik']),
    scoreIkm_(r.Penanganan_Pengaduan,['Tidak Ada','Ada tetapi tidak berfungsi','Berfungsi kurang maksimal','Dikelola dengan baik'])
  ],saran:clean_(r.Saran)}));
  return {periodLabel:label,quarter:quarter,year:year,records:records};
}
function scoreIkm_(value, options) {
  const v=clean_(value); if(!v)return 0;
  if(v==='Tidak Sopan dan Ramah')return 1;
  if(v==='Kurang Sopan dan Ramah')return 2;
  if(v==='Sopan dan Ramah')return 3;
  if(v==='Sangat Sopan dan Ramah')return 4;
  const i=options.indexOf(v); return i>=0?Math.max(1,Math.min(4,i+1)):0;
}
function generateIkmAnalysis(period, token) {
  const report=getIkmQuarterlyReport(period,token);
  const names=['Persyaratan Pelayanan','Prosedur Pelayanan','Waktu Penyelesaian','Biaya/Tarif','Produk Spesifikasi Jenis Pelayanan','Kompetensi Pelaksana','Perilaku Pelaksana','Sarana dan Prasarana','Penanganan Pengaduan, Saran dan Masukan'];
  const valid=report.records.filter(r=>r.scores.every(v=>v>=1&&v<=4));
  if(!valid.length)throw new Error('Belum ada respons lengkap pada '+report.periodLabel+'.');
  const sums=names.map((_,i)=>valid.reduce((a,r)=>a+r.scores[i],0));
  const nrr=sums.map(v=>v/valid.length),weighted=nrr.map(v=>v*0.11),total=weighted.reduce((a,b)=>a+b,0),ikm=total*25;
  const mutu=ikm>=88.31?'A (Sangat Baik)':ikm>=76.61?'B (Baik)':ikm>=65?'C (Kurang Baik)':'D (Tidak Baik)';
  return {periodLabel:report.periodLabel,count:valid.length,elements:names,respondents:valid,sums:sums,nrr:nrr,weighted:weighted,totalWeighted:total,ikm:ikm,mutu:mutu};
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Jalankan sekali secara manual dari Apps Script Editor dengan akun pemilik.
 * Membuat spreadsheet database dan folder Drive privat, lalu menyimpan ID-nya.
 */
function setupLintas() {
  const props = PropertiesService.getScriptProperties();
  // PIN sementara sesuai instruksi pemilik. Ganti segera setelah uji awal.
  if (!props.getProperty('FO_PIN_HASH')) props.setProperty('FO_PIN_HASH', sha256Hex_('123456'));
  if (!props.getProperty('ADMIN_PIN_HASH')) props.setProperty('ADMIN_PIN_HASH', sha256Hex_('123456'));
  let ssId = props.getProperty('LINTAS_SPREADSHEET_ID');
  let ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Database LINTAS DPMD');
    props.setProperty('LINTAS_SPREADSHEET_ID', ss.getId());
  }

  Object.keys(LINTAS.HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = LINTAS.HEADERS[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#102544').setFontColor('#ffffff');
      sh.autoResizeColumns(1, Math.min(headers.length, 12));
    } else {
      const existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
      const missing = headers.filter(h => existing.indexOf(h) === -1);
      if (missing.length) throw new Error('Kolom sheet ' + name + ' tidak cocok. Jangan ubah header manual; gunakan database baru atau migrasi terencana.');
    }
  });

  // Siapkan data awal status pejabat; status disimpan bersama di database.
  const officialSheet = ss.getSheetByName(LINTAS.SHEETS.OFFICIALS);
  if (officialSheet.getLastRow() < 2) {
    const officials = [
      ['KADIS','Kepala Dinas','MOHAMMAD SYAHID, S.STP, M.AP','19790629 200003 1 004','Belum diperbarui','',''],
      ['SEKRETARIS','Sekretaris','YUDO RESTANTO, S.STP, M.IP','19860901 200412 1 002','Belum diperbarui','',''],
      ['KABID_PM','Kepala Bidang Bina Pemberdayaan Masyarakat','ADY TASADA KESUMA TAHJI, S.Gz, M.M','19700915 199203 1 009','Belum diperbarui','',''],
      ['KABID_PEMDES','Kepala Bidang Bina Pemerintahan Desa','FEBRIAN NOVIEAR A.R, S.H., M.A','19861013 201502 1 001','Belum diperbarui','',''],
      ['KABID_PKAED','Kepala Bidang Bina Perencanaan, Keuangan, Aset, Evaluasi dan Data Desa','INDRA WARDHANA, S.STP','19831106 200212 1 001','Belum diperbarui','',''],
      ['KASUBBAG_UMUM','Kepala Sub Bagian Umum dan Kepegawaian','SUBI HARTATI, ST','19690421 200701 2 032','Belum diperbarui','',''],
      ['KASUBBAG_RENKEU','Kepala Sub Bagian Perencanaan dan Keuangan','ACHMAD SYAFARIADI, SE','19720329 200801 1 010','Belum diperbarui','','']
    ];
    officialSheet.getRange(2,1,officials.length,officials[0].length).setValues(officials);
  }

  // Hapus sheet default kosong jika aman.
  ss.getSheets().forEach(sh => {
    if (!Object.values(LINTAS.SHEETS).includes(sh.getName()) &&
        sh.getLastRow() === 0 && ss.getSheets().length > Object.keys(LINTAS.HEADERS).length) {
      ss.deleteSheet(sh);
    }
  });

  let folderId = props.getProperty('LINTAS_DRIVE_FOLDER_ID');
  let folder = null;
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; }
  }
  if (!folder) {
    folder = DriveApp.createFolder('ARSIP LINTAS DPMD');
    props.setProperty('LINTAS_DRIVE_FOLDER_ID', folder.getId());
  }
  // Jangan membuat folder publik. File mewarisi akses privat folder.
  const config = ss.getSheetByName(LINTAS.SHEETS.CONFIG);
  const values = config.getDataRange().getValues();
  const known = {};
  values.slice(1).forEach(r => { if (r[0]) known[String(r[0])] = true; });
  const additions = [
    ['Nama_Aplikasi', LINTAS.APP_NAME],
    ['Email_Pengelola', LINTAS.OWNER_EMAIL],
    ['Zona_Waktu', LINTAS.TZ],
    ['Spreadsheet_ID', ss.getId()],
    ['Folder_Arsip_ID', folder.getId()],
    ['Versi_Schema', '1.0']
  ].filter(r => !known[r[0]]);
  if (additions.length) config.getRange(config.getLastRow() + 1, 1, additions.length, 2).setValues(additions);

  return {
    ok: true,
    message: 'Setup selesai. Database dan folder arsip dibuat.',
    spreadsheetUrl: ss.getUrl(),
    folderUrl: folder.getUrl(),
    ownerEmail: LINTAS.OWNER_EMAIL
  };
}


function getServerClock(token) {
  requireSession_(token, ['FRONT_OFFICE','ADMIN_SURAT','KASUBBAG_UMPEG']);
  const now = new Date();
  return {time: Utilities.formatDate(now, LINTAS.TZ, 'dd-MM-yyyy HH:mm:ss'), hour: Number(Utilities.formatDate(now, LINTAS.TZ, 'H')), timezone:'WITA'};
}

/** Jalankan sekali dari editor untuk memicu permintaan otorisasi UrlFetchApp. */
function authorizeLintasExternalRequest() {
  const url = 'https://www.google.com/generate_204';
  const response = UrlFetchApp.fetch(url, {muteHttpExceptions:true, followRedirects:true});
  return {ok:true, httpCode:response.getResponseCode(), message:'Otorisasi UrlFetchApp berhasil. Kembali ke aplikasi LINTAS.'};
}

function login(role, pin) {
  role=String(role||'').toUpperCase();
  if(!['FRONT_OFFICE','ADMIN_SURAT','KASUBBAG_UMPEG'].includes(role)) throw new Error('Peran tidak valid.');
  const props=PropertiesService.getScriptProperties();
  const key=role==='FRONT_OFFICE'?'FO_PIN_HASH':role==='ADMIN_SURAT'?'ADMIN_PIN_HASH':'KASUBBAG_UMPEG_PIN_HASH';
  const expected=props.getProperty(key)||(role==='KASUBBAG_UMPEG'?sha256Hex_('123456'):'');
  if(!expected) throw new Error('PIN belum dikonfigurasi. Atur FO_PIN_HASH dan ADMIN_PIN_HASH di Script Properties.');
  const actual=sha256Hex_(String(pin||''));
  if(!constantTimeEquals_(actual,expected)){Utilities.sleep(500);audit_('LOGIN_GAGAL',role,'','PIN salah');throw new Error('PIN tidak sesuai.');}
  // Bersihkan sesi lama yang kedaluwarsa agar Script Properties tidak terus bertambah.
  const allProps=props.getProperties();
  Object.keys(allProps).forEach(k=>{
    if(k.indexOf('LINTAS_SESSION_')!==0)return;
    try { const old=JSON.parse(allProps[k]); if(!old.expiresAt || Date.now()>=Number(old.expiresAt)) props.deleteProperty(k); }
    catch(e) { props.deleteProperty(k); }
  });
  const token=Utilities.getUuid()+Utilities.getUuid().replace(/-/g,'');
  const ttl=Math.min(Math.max(Number(props.getProperty('SESSION_TTL_SECONDS')||21600),600),21600);
  const now=Date.now();
  const session={role:role,actor:LINTAS.OWNER_EMAIL,createdAt:now,expiresAt:now+ttl*1000};
  // Simpan sesi di Script Properties agar tidak hilang saat CacheService dibersihkan.
  props.setProperty('LINTAS_SESSION_'+token,JSON.stringify(session));
  audit_('LOGIN_BERHASIL',role,'','Sesi dibuat');
  return {ok:true,token:token,role:role,expiresInSeconds:ttl};
}
/** Jalankan manual satu kali dari Apps Script Editor untuk mengatur ulang PIN sementara. */
function resetTemporaryPins() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('FO_PIN_HASH', sha256Hex_('123456'));
  props.setProperty('ADMIN_PIN_HASH', sha256Hex_('123456'));
  return 'PIN sementara kedua peran telah diatur menjadi 123456. Deploy ulang Web App setelah menjalankan fungsi ini.';
}

function logout(token){
  if(token) PropertiesService.getScriptProperties().deleteProperty('LINTAS_SESSION_'+String(token));
  return {ok:true};
}
function requireSession_(token,allowedRoles){
  if(!token)throw new Error('Sesi berakhir. Silakan masuk kembali.');
  const props=PropertiesService.getScriptProperties();
  const key='LINTAS_SESSION_'+String(token);
  const raw=props.getProperty(key);
  if(!raw)throw new Error('Sesi berakhir. Silakan masuk kembali.');
  let session;
  try { session=JSON.parse(raw); } catch(e) { props.deleteProperty(key); throw new Error('Sesi tidak valid. Silakan masuk kembali.'); }
  if(!session.expiresAt || Date.now()>=Number(session.expiresAt)){
    props.deleteProperty(key);
    throw new Error('Sesi berakhir. Silakan masuk kembali.');
  }
  if(allowedRoles&&!allowedRoles.includes(session.role))throw new Error('Akses tidak diizinkan untuk peran ini.');
  return session;
}
function sha256Hex_(value){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8);return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function constantTimeEquals_(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}

function getOfficialStatuses(token) {
  requireSession_(token, ['FRONT_OFFICE','ADMIN_SURAT','KASUBBAG_UMPEG']);
  const sh = getDb_().getSheetByName(LINTAS.SHEETS.OFFICIALS);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const idCol = headers.indexOf('ID_Pejabat');
  const statusCol = headers.indexOf('Status_Hari_Ini');
  const updatedCol = headers.indexOf('Diperbarui_Pada');
  const today = Utilities.formatDate(new Date(), LINTAS.TZ, 'yyyy-MM-dd');
  const out = [];
  for (let i=1;i<values.length;i++) {
    const row=values[i];
    let status=String(statusCol>=0 ? row[statusCol]||'Belum diperbarui' : 'Belum diperbarui');
    const rawUpdated = updatedCol>=0 ? row[updatedCol] : '';
    let updated = rawUpdated instanceof Date && !isNaN(rawUpdated.getTime())
      ? Utilities.formatDate(rawUpdated, LINTAS.TZ, 'yyyy-MM-dd HH:mm:ss')
      : String(rawUpdated || '').trim();
    const updatedDate = rawUpdated instanceof Date && !isNaN(rawUpdated.getTime())
      ? Utilities.formatDate(rawUpdated, LINTAS.TZ, 'yyyy-MM-dd')
      : updated.slice(0,10);
    if (updatedDate !== today && status !== 'Belum diperbarui') {
      if (statusCol>=0) sh.getRange(i+1,statusCol+1).setValue('Belum diperbarui');
      if (updatedCol>=0) sh.getRange(i+1,updatedCol+1).clearContent();
      status='Belum diperbarui'; updated='';
    }
    out.push({id:row[idCol],title:row[headers.indexOf('Jabatan')],name:row[headers.indexOf('Nama')],nip:row[headers.indexOf('NIP')],status:status,updatedAt:updated});
  }
  return out;
}
function saveOfficialStatus(id, status, token) {
  const session = requireSession_(token, ['FRONT_OFFICE']);
  const allowed = ['Ada di kantor','Keluar','Istirahat','Dinas luar','Izin','Sakit','Cuti','Belum diperbarui'];
  if (!allowed.includes(String(status))) throw new Error('Status keberadaan tidak valid.');
  const sh = getDb_().getSheetByName(LINTAS.SHEETS.OFFICIALS);
  const values = sh.getDataRange().getValues();
  const headers = values[0]; const idCol = headers.indexOf('ID_Pejabat');
  for (let i=1;i<values.length;i++) if (String(values[i][idCol])===String(id)) {
    sh.getRange(i+1,headers.indexOf('Status_Hari_Ini')+1).setValue(status);
    sh.getRange(i+1,headers.indexOf('Diperbarui_Pada')+1).setValue(Utilities.formatDate(new Date(),LINTAS.TZ,'yyyy-MM-dd HH:mm:ss'));
    sh.getRange(i+1,headers.indexOf('Diperbarui_Oleh')+1).setValue(session.actor||'Front Office');
    audit_('STATUS_PEJABAT_DIPERBARUI','PEJABAT',String(id),status);
    return {ok:true,status:status};
  }
  throw new Error('Data pejabat tidak ditemukan. Jalankan setupLintas() untuk menyiapkan database.');
}

function getInitialData(token) {
  const session = requireSession_(token, ['FRONT_OFFICE','ADMIN_SURAT','KASUBBAG_UMPEG']);
  assertConfigured_();
  return {
    appName: LINTAS.APP_NAME,
    serverNow: Utilities.formatDate(new Date(), LINTAS.TZ, 'dd:MM:yyyy HH:mm:ss') + ' WITA',
    counts: getCounts_(),
    incoming: listIncoming({limit: 5000}, token),
    outgoing: ['ADMIN_SURAT','KASUBBAG_UMPEG'].includes(session.role) ? listOutgoing({limit: 5000}, token) : [],
    userEmail: LINTAS.OWNER_EMAIL, role: session.role
  };
}

function getCounts_() {
  const ss = getDb_();
  const today = Utilities.formatDate(new Date(), LINTAS.TZ, 'yyyy-MM-dd');
  const month = Utilities.formatDate(new Date(), LINTAS.TZ, 'yyyy-MM');
  const incoming = rowsAsObjects_(ss.getSheetByName(LINTAS.SHEETS.INCOMING));
  const outgoing = rowsAsObjects_(ss.getSheetByName(LINTAS.SHEETS.OUTGOING));
  const visitors = rowsAsObjects_(ss.getSheetByName(LINTAS.SHEETS.VISITORS));
  const ikm = rowsAsObjects_(ss.getSheetByName(LINTAS.SHEETS.IKM));
  const satisfactionSheet = ss.getSheetByName('Kepuasan_Layanan');
  const satisfaction = satisfactionSheet ? rowsAsObjects_(satisfactionSheet) : [];
  const timestampKey = value => {
    if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, LINTAS.TZ, 'yyyy-MM-dd');
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0,10);
    const parsed = new Date(text);
    return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, LINTAS.TZ, 'yyyy-MM-dd');
  };
  return {
    incomingToday: incoming.filter(r => dateKey_(r.Tanggal_Diterima) === today).length,
    incomingMonth: incoming.filter(r => dateKey_(r.Tanggal_Diterima).slice(0,7) === month).length,
    incomingTotal: incoming.length,
    outgoingToday: outgoing.filter(r => dateKey_(r.Tanggal_Dicatat) === today).length,
    outgoingMonth: outgoing.filter(r => String(r.Tanggal_Dicatat).slice(0,7) === month).length,
    outgoingTotal: outgoing.length,
    visitorsToday: visitors.filter(r => timestampKey(r.Timestamp || r.Waktu_Datang) === today).length,
    ikmTotal: ikm.filter(r => String(r.ID_Survei || '').trim() !== '').length,
    ikmToday: ikm.filter(r => String(r.ID_Survei || '').trim() !== '' && timestampKey(r.Timestamp || r.Tanggal_Layanan) === today).length,
    satisfactionToday: satisfaction.filter(r => String(r.ID_Respons || '').trim() !== '' && timestampKey(r.Timestamp || r.Tanggal_Layanan) === today).length
  };
}

function saveIncoming(payload, token) {
  requireSession_(token, ['FRONT_OFFICE']);
  assertConfigured_();
  validateIncoming_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let uploaded = null;
  try {
    const sh = getDb_().getSheetByName(LINTAS.SHEETS.INCOMING);
    const requestId = clean_(payload.clientRequestId) || Utilities.getUuid();
    const existing = findByValue_(sh, 'Client_Request_ID', requestId);
    if (existing) return {ok:true, duplicate:true, record: publicRecord_(existing)};
    const duplicate = findDuplicateIncoming_(sh, payload);
    if (duplicate) throw new Error('Surat tidak disimpan karena terdeteksi duplikasi: nomor surat, asal surat, dan perihal sama dengan surat '+(duplicate.Nomor_Registrasi||'yang sudah tercatat')+'.');

    const now = new Date();
    const id = Utilities.getUuid();
    const dateKey = Utilities.formatDate(now, LINTAS.TZ, 'yyyyMMdd');
    const serial = nextSerial_(sh, 'Nomor_Registrasi', 'SM/' + Utilities.formatDate(now,LINTAS.TZ,'yyyy') + '/');
    const registration = 'SM/' + Utilities.formatDate(now, LINTAS.TZ, 'yyyy') + '/' + serial;
    const cardSerial = nextSerial_(sh, 'Nomor_Urut_Kartu', Utilities.formatDate(now,LINTAS.TZ,'yyyy') + '-');
    uploaded = saveScan_(payload.scan, registration, 'MASUK');
    const actor = getActor_();
    const row = {
      ID_Surat:id, Nomor_Registrasi:registration, Nomor_Urut_Kartu:Utilities.formatDate(now,LINTAS.TZ,'yyyy')+'-'+cardSerial,
      Tanggal_Diterima:Utilities.formatDate(now,LINTAS.TZ,'yyyy-MM-dd'),
      Waktu_Diterima:Utilities.formatDate(now,LINTAS.TZ,'HH:mm:ss'),
      Tanggal_Surat:clean_(payload.tanggalSurat), Nomor_Surat:clean_(payload.nomorSurat),
      Asal_Surat:clean_(payload.asalSurat), Perihal:clean_(payload.perihal),
      Isi_Ringkas:clean_(payload.isiRingkas), Jumlah_Lampiran:clean_(payload.jumlahLampiran),
      Sifat_Surat:clean_(payload.sifatSurat), Pengolah:clean_(payload.pengolah),
      Tanggal_Diteruskan:'', Tanda_Terima:'',
      Catatan:clean_(payload.catatan), File_Scan_ID:uploaded.id, File_Scan_Nama:uploaded.name,
      File_Scan_Mime:uploaded.mimeType, Status:'Terkirim ke Pengadministrasi', Petugas_Pencatat:actor,
      Dibuat_Pada:now, Diperbarui_Pada:now, Client_Request_ID:requestId
    };
    appendObject_(sh, row);
    syncArchive_(row);
    audit_('SIMPAN_SURAT_MASUK','Surat Masuk',id,'Registrasi '+registration);
    return {ok:true, record: publicRecord_(row)};
  } catch (err) {
    if (uploaded && uploaded.id) {
      try { DriveApp.getFileById(uploaded.id).setTrashed(true); } catch (ignore) {}
    }
    throw new Error(err.message || String(err));
  } finally {
    lock.releaseLock();
  }
}

function saveOutgoing(payload, token) {
  requireSession_(token, ['ADMIN_SURAT']);
  assertConfigured_();
  validateOutgoing_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let uploaded = null;
  try {
    const sh = getDb_().getSheetByName(LINTAS.SHEETS.OUTGOING);
    const requestId = clean_(payload.clientRequestId) || Utilities.getUuid();
    const existing = findByValue_(sh, 'Client_Request_ID', requestId);
    if (existing) return {ok:true, duplicate:true, record: existing};

    const now = new Date();
    const id = Utilities.getUuid();
    const year = Utilities.formatDate(now,LINTAS.TZ,'yyyy');
    const agendaSerial = nextSerial_(sh, 'Nomor_Agenda_Internal', 'AGK/' + year + '/');
    const agenda = 'AGK/' + year + '/' + agendaSerial;
    uploaded = saveScan_(payload.scan, agenda, 'KELUAR');
    const row = {
      ID_Surat:id, Nomor_Agenda_Internal:agenda,
      Tanggal_Dicatat:Utilities.formatDate(now,LINTAS.TZ,'yyyy-MM-dd'),
      Waktu_Dicatat:Utilities.formatDate(now,LINTAS.TZ,'HH:mm:ss'),
      Tanggal_Surat_Resmi:clean_(payload.tanggalSuratResmi),
      Nomor_Surat_Resmi:clean_(payload.nomorSuratResmi),
      Tujuan_Surat:clean_(payload.tujuanSurat), Perihal:clean_(payload.perihal),
      Sifat_Surat:clean_(payload.sifatSurat), Jumlah_Lampiran:clean_(payload.jumlahLampiran),
      Catatan:clean_(payload.catatan), File_Scan_ID:uploaded.id, File_Scan_Nama:uploaded.name,
      File_Scan_Mime:uploaded.mimeType, Petugas_Pencatat:getActor_(),
      Dibuat_Pada:now, Diperbarui_Pada:now, Client_Request_ID:requestId
    };
    appendObject_(sh,row);
    audit_('SIMPAN_SURAT_KELUAR','Surat Keluar',id,'Agenda '+agenda);
    return {ok:true, record:publicRecord_(row)};
  } catch (err) {
    if (uploaded && uploaded.id) {
      try { DriveApp.getFileById(uploaded.id).setTrashed(true); } catch (ignore) {}
    }
    throw new Error(err.message || String(err));
  } finally {
    lock.releaseLock();
  }
}

function listIncoming(filters, token) {
  requireSession_(token, ['FRONT_OFFICE','ADMIN_SURAT','KASUBBAG_UMPEG']);
  assertConfigured_();
  filters = filters || {};
  let rows = rowsAsObjects_(getDb_().getSheetByName(LINTAS.SHEETS.INCOMING));
  rows = rows.filter(r => matchesFilters_(r, filters, ['Perihal','Asal_Surat','Nomor_Surat','Nomor_Registrasi']));
  rows.sort((a,b) => String(b.Dibuat_Pada).localeCompare(String(a.Dibuat_Pada)));
  if (filters.limit) rows = rows.slice(0, Number(filters.limit));
  return rows.map(publicRecord_);
}
function listOutgoing(filters, token) {
  requireSession_(token, ['ADMIN_SURAT','KASUBBAG_UMPEG']);
  assertConfigured_();
  filters = filters || {};
  let rows = rowsAsObjects_(getDb_().getSheetByName(LINTAS.SHEETS.OUTGOING));
  rows = rows.filter(r => matchesFilters_(r, filters, ['Perihal','Tujuan_Surat','Nomor_Surat_Resmi','Nomor_Agenda_Internal']));
  rows.sort((a,b) => String(b.Dibuat_Pada).localeCompare(String(a.Dibuat_Pada)));
  if (filters.limit) rows = rows.slice(0, Number(filters.limit));
  return rows.map(publicRecord_);
}
function getRecordForPrint(id, token) {
  requireSession_(token, ['ADMIN_SURAT','KASUBBAG_UMPEG']);
  assertConfigured_();
  const row = findByValue_(getDb_().getSheetByName(LINTAS.SHEETS.INCOMING), 'ID_Surat', clean_(id));
  if (!row) throw new Error('Surat tidak ditemukan.');
  return publicRecord_(row);
}
function getScanUrl(id, type, token) {
  const session = requireSession_(token, ['FRONT_OFFICE','ADMIN_SURAT']);
  if (String(type||'MASUK').toUpperCase() === 'KELUAR' && session.role !== 'ADMIN_SURAT') throw new Error('Akses surat keluar hanya untuk Pengadministrasi Surat.');
  assertConfigured_();
  const sheetName = type === 'KELUAR' ? LINTAS.SHEETS.OUTGOING : LINTAS.SHEETS.INCOMING;
  const row = findByValue_(getDb_().getSheetByName(sheetName), 'ID_Surat', clean_(id));
  if (!row || !row.File_Scan_ID) throw new Error('File scan tidak ditemukan.');
  // URL Drive memerlukan akses Google yang berhak. File tidak dipublikasikan.
  return {url:'https://drive.google.com/open?id=' + encodeURIComponent(row.File_Scan_ID), name:row.File_Scan_Nama};
}

function updateIncomingStatus(id, status, token) {
  requireSession_(token, ['ADMIN_SURAT']);
  assertConfigured_();
  const allowed = ['Diverifikasi dan Dicetak', 'Diteruskan ke Kepala Dinas'];
  if (allowed.indexOf(String(status)) < 0) throw new Error('Status tujuan tidak valid.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sh = getDb_().getSheetByName(LINTAS.SHEETS.INCOMING);
    const rowNo = findRowNumber_(sh, 'ID_Surat', clean_(id));
    if (!rowNo) throw new Error('Surat tidak ditemukan.');
    const headers = getHeaders_(sh);
    const statusCol = headers.indexOf('Status') + 1;
    if (statusCol < 1) throw new Error('Kolom Status tidak ditemukan pada database.');
    const current = String(sh.getRange(rowNo, statusCol).getDisplayValue() || '');
    if (status === 'Diverifikasi dan Dicetak' && !['Terkirim ke Pengadministrasi','Menunggu pengadministrasi','Diterima pengadministrasi'].includes(current)) {
      if(current==='Diverifikasi dan Dicetak') throw new Error('Surat ini sudah diverifikasi dan dicetak.');
      throw new Error('Surat hanya dapat diproses jika statusnya Terkirim ke Pengadministrasi.');
    }
    if (status === 'Diteruskan ke Kepala Dinas' && current !== 'Diverifikasi dan Dicetak' && current !== 'Diproses') {
      if(current==='Diteruskan ke Kepala Dinas') throw new Error('Surat ini sudah diteruskan ke Kepala Dinas.');
      throw new Error('Verifikasi dan cetak Kartu Kendali serta Lembar Disposisi terlebih dahulu.');
    }
    const now = new Date();
    sh.getRange(rowNo, statusCol).setValue(status);
    const updatedCol = headers.indexOf('Diperbarui_Pada') + 1;
    if (updatedCol > 0) sh.getRange(rowNo, updatedCol).setValue(now);
    if (status === 'Diteruskan ke Kepala Dinas') {
      const forwardedCol = headers.indexOf('Tanggal_Diteruskan') + 1;
      if (forwardedCol > 0) sh.getRange(rowNo, forwardedCol).setValue(Utilities.formatDate(now, LINTAS.TZ, 'yyyy-MM-dd'));
    }
    const updated = rowToObject_(headers, sh.getRange(rowNo, 1, 1, headers.length).getValues()[0]);
    syncArchive_(updated);
    audit_('UBAH_STATUS_SURAT_MASUK', 'Surat Masuk', id, current + ' → ' + status);
    return {ok:true, record:publicRecord_(updated), previousStatus:current, message:'Status berhasil diperbarui: '+status};
  } finally { lock.releaseLock(); }
}

/* Helpers */
function assertConfigured_() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('LINTAS_SPREADSHEET_ID') || !p.getProperty('LINTAS_DRIVE_FOLDER_ID')) {
    throw new Error('Database belum disiapkan. Jalankan setupLintas() dari editor Apps Script.');
  }
}
function getDb_() {
  const id = PropertiesService.getScriptProperties().getProperty('LINTAS_SPREADSHEET_ID');
  if (!id) throw new Error('Database belum disiapkan.');
  return SpreadsheetApp.openById(id);
}
function getActor_() {
  // Email dapat kosong pada beberapa deployment Apps Script consumer-Gmail.
  // Jangan mengandalkan nilai ini sebagai autentikasi tunggal.
  return Session.getActiveUser().getEmail() || LINTAS.OWNER_EMAIL;
}
function validateIncoming_(p) {
  if (!p) throw new Error('Data surat tidak ditemukan.');
  ['tanggalSurat','nomorSurat','asalSurat','perihal','sifatSurat'].forEach(k => {
    if (!clean_(p[k])) throw new Error('Kolom wajib belum diisi: ' + k);
  });
  validateScan_(p.scan);
}
function validateOutgoing_(p) {
  if (!p) throw new Error('Data surat tidak ditemukan.');
  ['tanggalSuratResmi','nomorSuratResmi','tujuanSurat','perihal','sifatSurat'].forEach(k => {
    if (!clean_(p[k])) throw new Error('Kolom wajib belum diisi: ' + k);
  });
  validateScan_(p.scan);
}
function validateScan_(scan) {
  if (!scan || !scan.base64 || !scan.name || !scan.mimeType) throw new Error('Hasil scan surat wajib dilampirkan.');
  if (!['application/pdf','image/jpeg','image/png'].includes(scan.mimeType)) throw new Error('Format lampiran harus PDF, JPG, atau PNG.');
  const approxBytes = Math.floor(String(scan.base64).length * 3 / 4);
  if (approxBytes > LINTAS.MAX_FILE_BYTES) throw new Error('Ukuran file maksimal 10 MB.');
}
function saveScan_(scan, key, category) {
  validateScan_(scan);
  const folderId = PropertiesService.getScriptProperties().getProperty('LINTAS_DRIVE_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  const bytes = Utilities.base64Decode(scan.base64);
  if (bytes.length > LINTAS.MAX_FILE_BYTES) throw new Error('Ukuran file maksimal 10 MB.');
  const ext = scan.mimeType === 'application/pdf' ? '.pdf' : (scan.mimeType === 'image/png' ? '.png' : '.jpg');
  const safeName = String(key + '_' + category + '_' + (scan.name || 'scan').replace(/[^\w.\- ]/g,'_')).slice(0,180);
  const blob = Utilities.newBlob(bytes, scan.mimeType, safeName + (safeName.toLowerCase().endsWith(ext) ? '' : ext));
  const file = folder.createFile(blob);
  file.setDescription('Arsip LINTAS DPMD; kategori=' + category + '; referensi=' + key);
  return {id:file.getId(), name:file.getName(), mimeType:file.getMimeType()};
}
function syncArchive_(r) {
  const sh = getDb_().getSheetByName(LINTAS.SHEETS.ARCHIVE);
  const headers = getHeaders_(sh);
  const archive = {
    ID_Surat:r.ID_Surat, Nomor_Registrasi:r.Nomor_Registrasi,
    Nomor_Urut_Kartu:r.Nomor_Urut_Kartu, Indeks:'', Kode:'',
    Tanggal_Diterima:r.Tanggal_Diterima, Waktu_Diterima:r.Waktu_Diterima,
    Asal_Surat:r.Asal_Surat, Nomor_Surat:r.Nomor_Surat, Tanggal_Surat:r.Tanggal_Surat,
    Perihal:r.Perihal, Isi_Ringkas:r.Isi_Ringkas, Jumlah_Lampiran:r.Jumlah_Lampiran,
    Pengolah:r.Pengolah, Tanggal_Diteruskan:r.Tanggal_Diteruskan, Tanda_Terima:r.Tanda_Terima,
    Catatan:r.Catatan, File_Scan_ID:r.File_Scan_ID, File_Scan_Nama:r.File_Scan_Nama,
    Status_Verifikasi:r.Status, Dibuat_Pada:r.Dibuat_Pada, Diperbarui_Pada:r.Diperbarui_Pada
  };
  const rowNo = findRowNumber_(sh,'ID_Surat',r.ID_Surat);
  const values = headers.map(h => archive[h] === undefined ? '' : archive[h]);
  if (rowNo) sh.getRange(rowNo,1,1,headers.length).setValues([values]);
  else sh.appendRow(values);
}
function nextSerial_(sh, field, prefix) {
  const headers = getHeaders_(sh);
  const col = headers.indexOf(field)+1;
  if (col < 1 || sh.getLastRow() < 2) return '0001';
  const vals = sh.getRange(2,col,sh.getLastRow()-1,1).getDisplayValues().flat();
  let max = 0;
  vals.forEach(v => {
    const s = String(v || '');
    if (s.indexOf(prefix) === 0) {
      const n = parseInt(s.slice(prefix.length),10);
      if (Number.isFinite(n) && n > max) max=n;
    } else if (/^\d+$/.test(s)) {
      const n = parseInt(s,10); if (n>max) max=n;
    }
  });
  return String(max+1).padStart(4,'0');
}
function appendObject_(sh, obj) {
  const headers = getHeaders_(sh);
  sh.appendRow(headers.map(h => obj[h] === undefined ? '' : obj[h]));
}
function rowsAsObjects_(sh) {
  if (sh.getLastRow()<2) return [];
  const values=sh.getDataRange().getValues();
  const headers=values[0];
  return values.slice(1).filter(r=>r.some(v=>v!=='' && v!==null)).map(r=>rowToObject_(headers,r));
}
function rowToObject_(headers,row) {
  const dateOnly = ['Tanggal_Diterima','Tanggal_Surat','Tanggal_Diteruskan','Tanggal_Dicatat','Tanggal_Surat_Resmi'];
  const o={}; headers.forEach((h,i)=>o[h]=row[i] instanceof Date ? Utilities.formatDate(row[i],LINTAS.TZ,dateOnly.includes(h)?'yyyy-MM-dd':'yyyy-MM-dd HH:mm:ss') : row[i]);
  return o;
}
function dateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v,LINTAS.TZ,'yyyy-MM-dd');
  const s=String(v==null?'':v).trim();
  const m=s.match(/^(\d{4}-\d{2}-\d{2})/); if(m)return m[1];
  const d=new Date(s); return isNaN(d.getTime())?'':Utilities.formatDate(d,LINTAS.TZ,'yyyy-MM-dd');
}
function normDuplicateText_(v) { return clean_(v).normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('id'); }
function findDuplicateIncoming_(sh,payload) {
  const rows=rowsAsObjects_(sh);
  const no=normDuplicateText_(payload.nomorSurat), asal=normDuplicateText_(payload.asalSurat), perihal=normDuplicateText_(payload.perihal);
  return rows.find(r=>normDuplicateText_(r.Nomor_Surat)===no && normDuplicateText_(r.Asal_Surat)===asal && normDuplicateText_(r.Perihal)===perihal) || null;
}
function getHeaders_(sh) { return sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]; }
function findByValue_(sh, field, value) {
  const headers=getHeaders_(sh), col=headers.indexOf(field)+1;
  if(col<1 || sh.getLastRow()<2) return null;
  const vals=sh.getRange(2,col,sh.getLastRow()-1,1).getDisplayValues();
  for(let i=0;i<vals.length;i++) if(String(vals[i][0])===String(value)) {
    return rowToObject_(headers,sh.getRange(i+2,1,1,headers.length).getValues()[0]);
  }
  return null;
}
function findRowNumber_(sh, field, value) {
  const headers=getHeaders_(sh), col=headers.indexOf(field)+1;
  if(col<1 || sh.getLastRow()<2) return 0;
  const vals=sh.getRange(2,col,sh.getLastRow()-1,1).getDisplayValues();
  for(let i=0;i<vals.length;i++) if(String(vals[i][0])===String(value)) return i+2;
  return 0;
}
function matchesFilters_(r,f,fields) {
  const q=clean_(f.q).toLowerCase();
  if(q && !fields.some(k=>String(r[k]||'').toLowerCase().includes(q))) return false;
  const date=dateKey_(r.Tanggal_Diterima||r.Tanggal_Dicatat||'');
  if(f.year && date.slice(0,4)!==String(f.year)) return false;
  if(f.month && date.slice(5,7)!==String(f.month).padStart(2,'0')) return false;
  if(f.from && date < f.from) return false;
  if(f.to && date > f.to) return false;
  return true;
}
function publicRecord_(r) {
  const out={};
  Object.keys(r).forEach(k=>{
    if(k==='File_Scan_ID') out.scanUrl='https://drive.google.com/open?id='+encodeURIComponent(r[k]||'');
    else out[k]=r[k] instanceof Date ? Utilities.formatDate(r[k],LINTAS.TZ,'yyyy-MM-dd HH:mm:ss') : r[k];
  });
  return out;
}
function clean_(v) { return String(v===undefined||v===null?'':v).trim(); }
function audit_(action,type,id,detail) {
  try { getDb_().getSheetByName(LINTAS.SHEETS.AUDIT).appendRow([new Date(),getActor_(),action,type,id,detail]); } catch(e) {}
}


/* ================= INTEGRASI REKAP SURAT MASUK -> SIAP-DPMD =================
 * Periode selalu dihitung dari waktu server Apps Script zona Asia/Makassar (WITA).
 * Pengiriman hanya untuk blok 3 jam yang sudah selesai. ID transaksi deterministik
 * agar percobaan ulang menggunakan ID yang sama dan tidak membuat laporan ganda.
 * Script Properties LINTAS: LINTAS_SIAP_WEBAPP_URL, LINTAS_SIAP_SHARED_SECRET.
 */
const LINTAS_SIAP = {
  SHEET: 'SIAP_Integrasi',
  HEADERS: ['ID_Transaksi','Tanggal','Jam_Mulai','Jam_Selesai','Jumlah_Surat','Status','SIAP_Report_ID','Percobaan_Terakhir','Pesan_Terakhir','Dibuat_Pada','Diperbarui_Pada'],
  DEFAULT_URL: 'https://script.google.com/macros/s/AKfycbw9UJ2J6QQu0BtjSKBaqcR7yvEU-mpe8iJJf3IazeOLRDhewnOQRwT7nfzWW1egthly/exec',
  MAX_PHOTO_BYTES: 3 * 1024 * 1024
};

function getIncomingSummaryForSiap(options, token) {
  // Backward compatible: existing UI may call with only token.
  if (typeof options === 'string') { token = options; options = {}; }
  options = options || {};
  requireSession_(token, ['FRONT_OFFICE']);
  assertConfigured_();
  const period = selectedThreeHourPeriod_(options);
  const all = rowsAsObjects_(getDb_().getSheetByName(LINTAS.SHEETS.INCOMING));
  const rows = all.filter(r => incomingInPeriod_(r, period.start, period.end));
  const sheet = getOrCreateSiapIntegrationSheet_();
  const existing = rowsAsObjects_(sheet).find(r => String(r.ID_Transaksi || '') === period.id);
  return {
    ok: true, timezone: 'WITA', generatedAt: Utilities.formatDate(new Date(), LINTAS.TZ, 'dd-MM-yyyy HH:mm:ss'),
    integrationId: period.id, tanggal: period.tanggal, jamMulai: period.jamMulai, jamSelesai: period.jamSelesai,
    periodeLabel: period.label, jumlahSurat: rows.length,
    rows: rows.map(r => ({
      nomorRegistrasi: clean_(r.Nomor_Registrasi), tanggalDiterima: clean_(r.Tanggal_Diterima),
      waktuDiterima: clean_(r.Waktu_Diterima), asalSurat: clean_(r.Asal_Surat),
      nomorSurat: clean_(r.Nomor_Surat), perihal: clean_(r.Perihal), status: clean_(r.Status)
    })),
    sent: !!(existing && String(existing.Status) === 'BERHASIL'),
    statusKirim: existing ? String(existing.Status || 'BELUM DIKIRIM') : 'BELUM DIKIRIM',
    reportId: existing ? String(existing.SIAP_Report_ID || '') : '',
    lastMessage: existing ? String(existing.Pesan_Terakhir || '') : ''
  };
}

function sendIncomingSummaryToSiap(payload, token) {
  const session = requireSession_(token, ['FRONT_OFFICE']);
  assertConfigured_();
  payload = payload || {};
  const period = selectedThreeHourPeriod_({tanggal:clean_(payload.tanggal), jamMulai:clean_(payload.jamMulai)});
  if (period.end.getTime() > Date.now()) throw new Error('Periode 3 jam ini belum selesai menurut waktu server WITA. Rekap boleh dibaca, tetapi pengiriman dilakukan setelah periode selesai.');
  const suppliedId = clean_(payload.integrationId);
  if (suppliedId !== period.id) throw new Error('Periode rekap sudah berubah. Muat ulang rekap, lalu coba kembali.');
  const foto = clean_(payload.foto);
  const match = foto.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('Bukti harus berupa gambar PNG/JPG/WEBP yang valid.');
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length || bytes.length > LINTAS_SIAP.MAX_PHOTO_BYTES) throw new Error('Ukuran gambar setelah kompresi harus di bawah atau sama dengan 3 MB.');
  // Hitung ulang data di server; browser tidak dapat menentukan jumlah atau rentang data.
  const all = rowsAsObjects_(getDb_().getSheetByName(LINTAS.SHEETS.INCOMING));
  const rows = all.filter(r => incomingInPeriod_(r, period.start, period.end));
  if (!rows.length) throw new Error('Tidak ada surat masuk pada periode ' + period.label + '. Tidak ada laporan yang dikirim.');
  const sheet = getOrCreateSiapIntegrationSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let saved = rowsAsObjects_(sheet).find(r => String(r.ID_Transaksi || '') === period.id);
    if (saved && String(saved.Status || '') === 'BERHASIL') {
      return {ok:true, duplicate:true, integrationId:period.id, reportId:String(saved.SIAP_Report_ID || ''), message:'Transaksi ini sudah diterima SIAP. Tidak dibuat laporan baru.'};
    }
    const props = PropertiesService.getScriptProperties();
    const url = clean_(props.getProperty('LINTAS_SIAP_WEBAPP_URL')) || LINTAS_SIAP.DEFAULT_URL;
    const secret = String(props.getProperty('LINTAS_SIAP_SHARED_SECRET') || '');
    if (secret.length < 32) throw new Error('Konfigurasi rahasia belum lengkap. Atur LINTAS_SIAP_SHARED_SECRET di Script Properties LINTAS.');
    const count = rows.length;
    const kegiatan = 'Rekap surat masuk LINTAS DPMD periode ' + period.label;
    const output = count + ' surat masuk tercatat di LINTAS pada periode ' + period.label + '. Rincian terlampir pada bukti gambar.';
    const response = UrlFetchApp.fetch(url, {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload:JSON.stringify({action:'integrationSaveReport', payload:{
        integrationId:period.id, integrationSecret:secret, tanggal:period.tanggal,
        jamMulai:period.jamMulai, jamSelesai:period.jamSelesai,
        kegiatan:kegiatan, output:output, foto:foto
      }})
    });
    const httpCode = response.getResponseCode();
    let result;
    try { result = JSON.parse(response.getContentText() || '{}'); } catch (e) { result = null; }
    const now = Utilities.formatDate(new Date(), LINTAS.TZ, 'yyyy-MM-dd HH:mm:ss');
    if (httpCode < 200 || httpCode >= 300 || !result || result.ok !== true || !result.id) {
      const message = result && result.message ? String(result.message) : ('SIAP tidak mengembalikan konfirmasi penerimaan (HTTP ' + httpCode + ').');
      upsertSiapIntegration_(sheet, period, count, 'GAGAL', '', message, now);
      audit_('INTEGRASI_SIAP_GAGAL','SIAP_Integrasi',period.id,message);
      throw new Error('Pengiriman belum berhasil. ' + message + ' ID transaksi tetap ' + period.id + '; tekan Coba Kirim Ulang untuk mencoba kembali.');
    }
    upsertSiapIntegration_(sheet, period, count, 'BERHASIL', String(result.id), String(result.message || 'Diterima SIAP.'), now);
    audit_('INTEGRASI_SIAP_BERHASIL','SIAP_Integrasi',period.id,'Jumlah surat='+count+'; reportId='+result.id+'; actor='+clean_(session.role));
    return {ok:true, duplicate:!!result.duplicate, integrationId:period.id, reportId:String(result.id), jumlahSurat:count, message:String(result.message || 'SIAP mengonfirmasi penerimaan laporan.')};
  } catch (err) {
    // Kegagalan lokal/network tetap dicatat sebagai gagal, bukan berhasil; ID transaksi tidak berubah.
    const now = Utilities.formatDate(new Date(), LINTAS.TZ, 'yyyy-MM-dd HH:mm:ss');
    const existing = rowsAsObjects_(sheet).find(r => String(r.ID_Transaksi || '') === period.id);
    if (!existing || String(existing.Status || '') !== 'BERHASIL') {
      upsertSiapIntegration_(sheet, period, rows.length, 'GAGAL', '', String(err && err.message || err), now);
    }
    const errText = String(err && err.message || err);
    if (/UrlFetchApp\.fetch|script\.external_request|permission to call UrlFetchApp/i.test(errText)) {
      throw new Error('Pengiriman gagal karena proyek LINTAS belum mendapat otorisasi UrlFetchApp. Tambahkan scope https://www.googleapis.com/auth/script.external_request pada appsscript.json, simpan, jalankan authorizeLintasExternalRequest() sekali dari editor, setujui izin, lalu deploy versi baru. ID transaksi tetap '+period.id+'.');
    }
    throw err;
  } finally { lock.releaseLock(); }
}

function latestCompletedThreeHourPeriod_() {
  // Blok harian dimulai pukul 08.00 WITA:
  // 08-11, 11-14, 14-17, 17-20, dan 20-23.
  // Sebelum pukul 11.00, periode terakhir yang selesai adalah 20-23 hari sebelumnya.
  const now = new Date();
  const localDate = Utilities.formatDate(now, LINTAS.TZ, 'yyyy-MM-dd');
  const localHour = Number(Utilities.formatDate(now, LINTAS.TZ, 'H'));
  let startDate = localDate;
  let startHour;

  if (localHour < 11) {
    const todayMidnight = new Date(localDate + 'T00:00:00+08:00');
    const previousDay = new Date(todayMidnight.getTime() - 24 * 60 * 60 * 1000);
    startDate = Utilities.formatDate(previousDay, LINTAS.TZ, 'yyyy-MM-dd');
    startHour = 20;
  } else if (localHour < 14) {
    startHour = 8;
  } else if (localHour < 17) {
    startHour = 11;
  } else if (localHour < 20) {
    startHour = 14;
  } else if (localHour < 23) {
    startHour = 17;
  } else {
    startHour = 20;
  }

  return buildThreeHourPeriod_(startDate, startHour);
}

function selectedThreeHourPeriod_(options) {
  options = options || {};
  const date = clean_(options.tanggal);
  const hourText = clean_(options.jamMulai);
  if (!date || !hourText) return latestCompletedThreeHourPeriod_();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Tanggal periode tidak valid. Gunakan format YYYY-MM-DD.');
  }
  const parsedDate = new Date(date + 'T00:00:00+08:00');
  if (isNaN(parsedDate.getTime()) || Utilities.formatDate(parsedDate, LINTAS.TZ, 'yyyy-MM-dd') !== date) {
    throw new Error('Tanggal periode tidak valid.');
  }

  const hour = Number(hourText.slice(0, 2));
  if (![8, 11, 14, 17, 20].includes(hour)) {
    throw new Error('Blok periode harus dimulai pada pukul 08, 11, 14, 17, atau 20 WITA.');
  }

  // Rekap dapat ditampilkan untuk tanggal/blok yang dipilih.
  // sendIncomingSummaryToSiap tetap menolak pengiriman sebelum periode selesai.
  return buildThreeHourPeriod_(date, hour);
}

function buildThreeHourPeriod_(date, startHour) {
  if (![8, 11, 14, 17, 20].includes(Number(startHour))) {
    throw new Error('Jam mulai blok rekap tidak valid.');
  }

  const endHour = Number(startHour) + 3;
  const start = new Date(date + 'T' + String(startHour).padStart(2, '0') + ':00:00+08:00');
  const end = new Date(date + 'T' + String(endHour).padStart(2, '0') + ':00:00+08:00');
  const jamMulai = String(startHour).padStart(2, '0') + ':00';
  const jamSelesai = String(endHour).padStart(2, '0') + ':00';
  const id = 'LINTAS-' + date.replace(/-/g, '') + '-' + jamMulai.replace(':', '') + '-' + jamSelesai.replace(':', '');

  return {
    start: start,
    end: end,
    tanggal: date,
    jamMulai: jamMulai,
    jamSelesai: jamSelesai,
    id: id,
    label: Utilities.formatDate(start, LINTAS.TZ, 'dd-MM-yyyy HH:mm') + '–' +
      Utilities.formatDate(end, LINTAS.TZ, 'HH:mm') + ' WITA'
  };
}
function incomingInPeriod_(r, start, end) {
  // rowToObject_ normalizes date cells, but a time cell may arrive as a Date object
  // converted to 'yyyy-MM-dd HH:mm:ss'. Accept both that and HH:mm[:ss].
  let d = clean_(r.Tanggal_Diterima);
  if (r.Tanggal_Diterima instanceof Date) d = Utilities.formatDate(r.Tanggal_Diterima,LINTAS.TZ,'yyyy-MM-dd');
  d = normalizeIncomingDate_(d);
  let t = clean_(r.Waktu_Diterima);
  if (r.Waktu_Diterima instanceof Date) t = Utilities.formatDate(r.Waktu_Diterima,LINTAS.TZ,'HH:mm:ss');
  const dt = t.match(/\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (dt) { if (!d) d = dt[1]; t = dt[2]; }
  const tm = t.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && tm) {
    let time = tm[1]; if (/^\d:\d{2}/.test(time)) time = '0'+time;
    if (time.length === 5) time += ':00';
    const stamp = new Date(d + 'T' + time + '+08:00');
    if (!isNaN(stamp.getTime())) return stamp >= start && stamp < end;
  }
  // Fallback to server-created timestamp when receipt date/time cells are malformed.
  const rawCreated = r.Dibuat_Pada;
  const created = rawCreated instanceof Date ? rawCreated : new Date(clean_(rawCreated));
  return !isNaN(created.getTime()) && created >= start && created < end;
}
function normalizeIncomingDate_(value) {
  const s = clean_(value);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1]+'-'+m[2]+'-'+m[3];
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  return '';
}
function getOrCreateSiapIntegrationSheet_() {
  const ss = getDb_();
  let sh = ss.getSheetByName(LINTAS_SIAP.SHEET);
  if (!sh) sh = ss.insertSheet(LINTAS_SIAP.SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(LINTAS_SIAP.HEADERS);
  else {
    const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),1)).getValues()[0].map(String);
    const missing = LINTAS_SIAP.HEADERS.filter(h => !current.includes(h));
    if (missing.length) sh.getRange(1,current.length+1,1,missing.length).setValues([missing]);
  }
  return sh;
}
function upsertSiapIntegration_(sh, period, count, status, reportId, message, now) {
  const last = sh.getLastRow();
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const vals = last > 1 ? sh.getRange(2,1,last-1,headers.length).getValues() : [];
  let rowNum = -1;
  for (let i=0;i<vals.length;i++) if (String(vals[i][headers.indexOf('ID_Transaksi')]) === period.id) { rowNum=i+2; break; }
  const old = rowNum > 0 ? vals[rowNum-2] : [];
  const obj = {'ID_Transaksi':period.id,'Tanggal':period.tanggal,'Jam_Mulai':period.jamMulai,'Jam_Selesai':period.jamSelesai,'Jumlah_Surat':count,'Status':status,'SIAP_Report_ID':reportId,'Percobaan_Terakhir':now,'Pesan_Terakhir':String(message||'').slice(0,1000),'Dibuat_Pada':old[headers.indexOf('Dibuat_Pada')] || now,'Diperbarui_Pada':now};
  const row = headers.map(h => Object.prototype.hasOwnProperty.call(obj,h) ? obj[h] : '');
  if (rowNum > 0) sh.getRange(rowNum,1,1,headers.length).setValues([row]); else sh.appendRow(row);
}


/** Koreksi terbatas surat masuk oleh Front Office hanya pada hari pencatatan dan sebelum diproses admin. */
function editIncomingByFrontOffice(id, patch, token) {
  requireSession_(token, ['FRONT_OFFICE']);
  assertConfigured_();
  patch=patch||{};
  const sh=getDb_().getSheetByName(LINTAS.SHEETS.INCOMING);
  const rowNo=findRowNumber_(sh,'ID_Surat',clean_(id));
  if(!rowNo) throw new Error('Surat tidak ditemukan.');
  const headers=getHeaders_(sh);
  const row=rowsAsObjects_(sh).find(r=>String(r.ID_Surat)===String(id));
  if(!row) throw new Error('Surat tidak ditemukan.');
  const today=Utilities.formatDate(new Date(),LINTAS.TZ,'yyyy-MM-dd');
  if(String(row.Tanggal_Diterima||'').slice(0,10)!==today) throw new Error('Koreksi hanya diizinkan pada hari pencatatan.');
  if(!['Terkirim ke Pengadministrasi','Menunggu pengadministrasi','Diterima pengadministrasi'].includes(String(row.Status||''))) throw new Error('Surat tidak dapat diedit karena sudah mulai diproses.');
  const nomorSurat=clean_(patch.nomorSurat), asalSurat=clean_(patch.asalSurat), perihal=clean_(patch.perihal), tanggalSurat=clean_(patch.tanggalSurat), sifatSurat=clean_(patch.sifatSurat);
  if(!nomorSurat||!asalSurat||!perihal||!/^\\d{4}-\\d{2}-\\d{2}$/.test(tanggalSurat)||!['Biasa','Penting','Segera'].includes(sifatSurat)) throw new Error('Data wajib tidak lengkap atau format tanggal/sifat surat tidak valid.');
  const updates={Nomor_Surat:nomorSurat,Asal_Surat:asalSurat,Perihal:perihal,Tanggal_Surat:tanggalSurat,Sifat_Surat:sifatSurat,Catatan:clean_(patch.catatan).slice(0,2000),Diperbarui_Pada:new Date()};
  headers.forEach((key,i)=>{if(Object.prototype.hasOwnProperty.call(updates,key))sh.getRange(rowNo,i+1).setValue(updates[key]);});
  const updated=Object.assign({},row,updates);
  syncArchive_(updated);
  audit_('KOREKSI_SURAT_MASUK','Surat Masuk',String(id),'Koreksi oleh Front Office');
  return {ok:true,record:publicRecord_(updated)};
}
/** Penghapusan terbatas surat salah input: hanya hari pencatatan dan sebelum diproses admin. */
function deleteIncomingByFrontOffice(id, token) {
  requireSession_(token, ['FRONT_OFFICE']);
  assertConfigured_();
  const sh=getDb_().getSheetByName(LINTAS.SHEETS.INCOMING);
  const rowNo=findRowNumber_(sh,'ID_Surat',clean_(id));
  if(!rowNo) throw new Error('Surat tidak ditemukan.');
  const row=rowsAsObjects_(sh).find(r=>String(r.ID_Surat)===String(id));
  if(!row) throw new Error('Surat tidak ditemukan.');
  const today=Utilities.formatDate(new Date(),LINTAS.TZ,'yyyy-MM-dd');
  if(String(row.Tanggal_Diterima||'').slice(0,10)!==today) throw new Error('Penghapusan hanya diizinkan pada hari pencatatan.');
  if(!['Terkirim ke Pengadministrasi','Menunggu pengadministrasi','Diterima pengadministrasi'].includes(String(row.Status||''))) throw new Error('Surat tidak dapat dihapus karena sudah mulai diproses.');
  const archive=getDb_().getSheetByName(LINTAS.SHEETS.ARCHIVE);
  const archiveRow=archive?findRowNumber_(archive,'ID_Surat',clean_(id)):0;
  if(archiveRow) archive.deleteRow(archiveRow);
  sh.deleteRow(rowNo);
  audit_('HAPUS_SURAT_MASUK','Surat Masuk',String(id),'Dihapus oleh Front Office karena salah input; file scan Drive dipertahankan untuk audit.');
  return {ok:true};
}

/** Rekap seluruh surat masuk hari ini menurut zona waktu server WITA. */
function getDailyIncomingSummaryForSiap(token) {
  requireSession_(token, ['FRONT_OFFICE']);
  assertConfigured_();
  const today=Utilities.formatDate(new Date(),LINTAS.TZ,'yyyy-MM-dd');
  const all=rowsAsObjects_(getDb_().getSheetByName(LINTAS.SHEETS.INCOMING));
  const rows=all.filter(r=>{let d=r.Tanggal_Diterima instanceof Date?Utilities.formatDate(r.Tanggal_Diterima,LINTAS.TZ,'yyyy-MM-dd'):normalizeIncomingDate_(r.Tanggal_Diterima);if(!d&&r.Dibuat_Pada){const x=r.Dibuat_Pada instanceof Date?r.Dibuat_Pada:new Date(r.Dibuat_Pada);if(!isNaN(x.getTime()))d=Utilities.formatDate(x,LINTAS.TZ,'yyyy-MM-dd');}return d===today;});
  return {ok:true,timezone:'WITA',tanggal:today,generatedAt:Utilities.formatDate(new Date(),LINTAS.TZ,'dd-MM-yyyy HH:mm:ss'),jumlahSurat:rows.length,rows:rows.map(r=>({nomorRegistrasi:clean_(r.Nomor_Registrasi),tanggalDiterima:clean_(r.Tanggal_Diterima),waktuDiterima:clean_(r.Waktu_Diterima),asalSurat:clean_(r.Asal_Surat),nomorSurat:clean_(r.Nomor_Surat),perihal:clean_(r.Perihal),status:clean_(r.Status)}))};
}
