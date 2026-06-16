// 11개 언어 번역 패키지
export const LANGUAGES = [
  { code: "ko", label: "한국어",    flag: "🇰🇷" },
  { code: "en", label: "English",   flag: "🇺🇸" },
  { code: "zh", label: "中文",      flag: "🇨🇳" },
  { code: "ja", label: "日本語",    flag: "🇯🇵" },
  { code: "hi", label: "हिन्दी",   flag: "🇮🇳" },
  { code: "es", label: "Español",   flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "fr", label: "Français",  flag: "🇫🇷" },
  { code: "de", label: "Deutsch",   flag: "🇩🇪" },
  { code: "vi", label: "Tiếng Việt",flag: "🇻🇳" },
  { code: "id", label: "Indonesia", flag: "🇮🇩" },
];

export const T = {
  // ── 탭 이름 ──────────────────────────────────────────────────────────────
  tab_dashboard:   { ko:"대시보드", en:"Dashboard",   zh:"仪表盘",  ja:"ダッシュボード", hi:"डैशबोर्ड",    es:"Panel",      pt:"Painel",      fr:"Tableau",    de:"Übersicht",  vi:"Tổng quan",   id:"Dashboard" },
  tab_auto:        { ko:"자동화방", en:"Auto Room",   zh:"自动房间", ja:"自動ルーム",     hi:"ऑटो रूम",   es:"Sala Auto",  pt:"Sala Auto",   fr:"Salle Auto", de:"Auto-Raum",  vi:"Phòng Tự Động",id:"Ruang Otomatis" },
  tab_custom:      { ko:"커스텀방", en:"Custom Room", zh:"自定义房间",ja:"カスタムルーム", hi:"कस्टम रूम", es:"Sala Custom",pt:"Sala Custom", fr:"Salle Perso",de:"Benutzerdefiniert",vi:"Phòng Tùy Chỉnh",id:"Ruang Kustom" },
  tab_whitepaper:  { ko:"화이트페이퍼", en:"Whitepaper", zh:"白皮书", ja:"ホワイトペーパー", hi:"व्हाइटपेपर", es:"Documento",  pt:"Whitepaper",  fr:"Livre Blanc",de:"Whitepaper", vi:"Sách Trắng",  id:"Whitepaper" },

  // ── 헤더 ─────────────────────────────────────────────────────────────────
  connect_wallet:  { ko:"MetaMask 연결", en:"Connect Wallet", zh:"连接钱包", ja:"ウォレット接続", hi:"वॉलेट जोड़ें", es:"Conectar Billetera", pt:"Conectar Carteira", fr:"Connecter Portefeuille", de:"Wallet verbinden", vi:"Kết nối Ví", id:"Hubungkan Dompet" },
  connecting:      { ko:"연결 중...", en:"Connecting...", zh:"连接中...", ja:"接続中...", hi:"जोड़ रहे हैं...", es:"Conectando...", pt:"Conectando...", fr:"Connexion...", de:"Verbinde...", vi:"Đang kết nối...", id:"Menghubungkan..." },
  chain:           { ko:"체인", en:"Chain", zh:"链", ja:"チェーン", hi:"चेन", es:"Cadena", pt:"Rede", fr:"Réseau", de:"Kette", vi:"Mạng", id:"Rantai" },

  // ── 대시보드 ──────────────────────────────────────────────────────────────
  platform_status: { ko:"HH Finance 플랫폼 현황", en:"HH Finance Platform Stats", zh:"HH Finance 平台状态", ja:"HH Finance プラットフォーム状況", hi:"HH Finance प्लेटफॉर्म आँकड़े", es:"Estado de la Plataforma", pt:"Status da Plataforma", fr:"Statistiques Plateforme", de:"Plattform-Statistiken", vi:"Thống kê Nền tảng", id:"Statistik Platform" },
  total_users:     { ko:"총 참여 유저 수", en:"Total Users", zh:"总用户数", ja:"総ユーザー数", hi:"कुल उपयोगकर्ता", es:"Usuarios Totales", pt:"Total de Usuários", fr:"Utilisateurs Totaux", de:"Gesamtnutzer", vi:"Tổng người dùng", id:"Total Pengguna" },
  total_pool:      { ko:"총 계 금액", en:"Total Pool", zh:"总资金池", ja:"総プール金額", hi:"कुल पूल", es:"Pool Total", pt:"Pool Total", fr:"Pool Total", de:"Gesamtpool", vi:"Tổng Quỹ", id:"Total Pool" },
  total_rooms:     { ko:"총 방 수", en:"Total Rooms", zh:"总房间数", ja:"総ルーム数", hi:"कुल कमरे", es:"Total Salas", pt:"Total de Salas", fr:"Total Salles", de:"Räume gesamt", vi:"Tổng phòng", id:"Total Ruang" },
  active_rooms:    { ko:"진행 중인 방", en:"Active Rooms", zh:"活跃房间", ja:"進行中ルーム", hi:"सक्रिय कमरे", es:"Salas Activas", pt:"Salas Ativas", fr:"Salles Actives", de:"Aktive Räume", vi:"Phòng đang hoạt động", id:"Ruang Aktif" },
  my_assets:       { ko:"내 자산 현황", en:"My Assets", zh:"我的资产", ja:"マイ資産", hi:"मेरी संपत्ति", es:"Mis Activos", pt:"Meus Ativos", fr:"Mes Actifs", de:"Meine Assets", vi:"Tài sản của tôi", id:"Aset Saya" },
  hhusd_balance:   { ko:"HHUSD 잔액", en:"HHUSD Balance", zh:"HHUSD 余额", ja:"HHUSD 残高", hi:"HHUSD बैलेंस", es:"Saldo HHUSD", pt:"Saldo HHUSD", fr:"Solde HHUSD", de:"HHUSD Guthaben", vi:"Số dư HHUSD", id:"Saldo HHUSD" },
  locked_col:      { ko:"잠긴 담보 총액", en:"Locked Collateral", zh:"锁定抵押品", ja:"ロック担保", hi:"लॉक्ड कोलैटरल", es:"Garantía Bloqueada", pt:"Colateral Bloqueado", fr:"Garantie Bloquée", de:"Gesperrte Sicherheit", vi:"Tài sản thế chấp bị khóa", id:"Jaminan Terkunci" },
  my_rooms:        { ko:"참여 중인 방", en:"My Rooms", zh:"我的房间", ja:"参加中のルーム", hi:"मेरे कमरे", es:"Mis Salas", pt:"Minhas Salas", fr:"Mes Salles", de:"Meine Räume", vi:"Phòng của tôi", id:"Ruang Saya" },
  no_rooms:        { ko:"아직 참여 중인 방이 없습니다.", en:"No rooms joined yet.", zh:"尚未加入任何房间。", ja:"まだ参加中のルームはありません。", hi:"अभी तक कोई कमरा नहीं।", es:"Aún no has unido a ninguna sala.", pt:"Nenhuma sala ainda.", fr:"Aucune salle encore.", de:"Noch keine Räume.", vi:"Chưa tham gia phòng nào.", id:"Belum ada ruang." },
  contracts:       { ko:"컨트랙트 주소", en:"Contract Addresses", zh:"合约地址", ja:"コントラクトアドレス", hi:"अनुबंध पते", es:"Direcciones de Contrato", pt:"Endereços de Contrato", fr:"Adresses de Contrat", de:"Vertragsadressen", vi:"Địa chỉ Hợp đồng", id:"Alamat Kontrak" },

  // ── 자동화방 ──────────────────────────────────────────────────────────────
  join:            { ko:"참가", en:"Join", zh:"加入", ja:"参加", hi:"शामिल हों", es:"Unirse", pt:"Entrar", fr:"Rejoindre", de:"Beitreten", vi:"Tham gia", id:"Bergabung" },
  no_room:         { ko:"방 없음", en:"No room", zh:"无房间", ja:"ルームなし", hi:"कोई कमरा नहीं", es:"Sin sala", pt:"Sem sala", fr:"Aucune salle", de:"Kein Raum", vi:"Không có phòng", id:"Tidak ada ruang" },
  refresh:         { ko:"새로고침", en:"Refresh", zh:"刷新", ja:"更新", hi:"ताज़ा करें", es:"Actualizar", pt:"Atualizar", fr:"Actualiser", de:"Aktualisieren", vi:"Làm mới", id:"Segarkan" },
  my_room_tab:     { ko:"내 방", en:"My Room", zh:"我的房间", ja:"マイルーム", hi:"मेरा कमरा", es:"Mi Sala", pt:"Minha Sala", fr:"Ma Salle", de:"Mein Raum", vi:"Phòng của tôi", id:"Ruang Saya" },
  tier_status:     { ko:"티어별 현황", en:"Tier Status", zh:"档位状态", ja:"ティア状況", hi:"टियर स्थिति", es:"Estado por Nivel", pt:"Status por Nível", fr:"Statut par Niveau", de:"Tier-Status", vi:"Trạng thái Cấp", id:"Status Tingkat" },

  // ── 커스텀방 ──────────────────────────────────────────────────────────────
  create_room:     { ko:"방 만들기", en:"Create Room", zh:"创建房间", ja:"ルーム作成", hi:"कमरा बनाएं", es:"Crear Sala", pt:"Criar Sala", fr:"Créer Salle", de:"Raum erstellen", vi:"Tạo phòng", id:"Buat Ruang" },
  all_rooms:       { ko:"전체 방", en:"All Rooms", zh:"所有房间", ja:"全ルーム", hi:"सभी कमरे", es:"Todas las Salas", pt:"Todas as Salas", fr:"Toutes les Salles", de:"Alle Räume", vi:"Tất cả phòng", id:"Semua Ruang" },
  contribution:    { ko:"사이클당 기여금 (HHUSD)", en:"Contribution per Cycle (HHUSD)", zh:"每周期贡献额 (HHUSD)", ja:"サイクルあたり拠出額 (HHUSD)", hi:"प्रति चक्र योगदान (HHUSD)", es:"Contribución por Ciclo (HHUSD)", pt:"Contribuição por Ciclo (HHUSD)", fr:"Contribution par Cycle (HHUSD)", de:"Beitrag pro Zyklus (HHUSD)", vi:"Đóng góp mỗi chu kỳ (HHUSD)", id:"Kontribusi per Siklus (HHUSD)" },
  max_members:     { ko:"최대 인원", en:"Max Members", zh:"最大成员数", ja:"最大メンバー数", hi:"अधिकतम सदस्य", es:"Máx. Miembros", pt:"Máx. Membros", fr:"Membres Max.", de:"Max. Mitglieder", vi:"Tối đa thành viên", id:"Maks. Anggota" },
  cycle_days:      { ko:"납입 기한 (일)", en:"Cycle Duration (days)", zh:"纳款期限 (天)", ja:"納入期限 (日)", hi:"चक्र अवधि (दिन)", es:"Duración del Ciclo (días)", pt:"Duração do Ciclo (dias)", fr:"Durée du Cycle (jours)", de:"Zyklusdauer (Tage)", vi:"Thời hạn chu kỳ (ngày)", id:"Durasi Siklus (hari)" },
  enroll_hours:    { ko:"모집 기간 (시간)", en:"Enrollment Period (hours)", zh:"招募期 (小时)", ja:"募集期間 (時間)", hi:"नामांकन अवधि (घंटे)", es:"Período de Inscripción (horas)", pt:"Período de Inscrição (horas)", fr:"Période d'Inscription (heures)", de:"Einschreibezeitraum (Stunden)", vi:"Thời gian đăng ký (giờ)", id:"Periode Pendaftaran (jam)" },
  required_col:    { ko:"필요 담보 (140%)", en:"Required Collateral (140%)", zh:"所需抵押品 (140%)", ja:"必要担保 (140%)", hi:"आवश्यक कोलैटरल (140%)", es:"Garantía Requerida (140%)", pt:"Colateral Necessário (140%)", fr:"Garantie Requise (140%)", de:"Erforderliche Sicherheit (140%)", vi:"Tài sản thế chấp yêu cầu (140%)", id:"Jaminan yang Dibutuhkan (140%)" },
  create_join:     { ko:"방 만들기 + 계장으로 참가", en:"Create Room + Join as Organizer", zh:"创建房间 + 以组织者身份加入", ja:"ルーム作成 + 主催者として参加", hi:"कमरा बनाएं + आयोजक के रूप में शामिल हों", es:"Crear Sala + Unirse como Organizador", pt:"Criar Sala + Entrar como Organizador", fr:"Créer Salle + Rejoindre en tant qu'Organisateur", de:"Raum erstellen + Als Organisator beitreten", vi:"Tạo phòng + Tham gia với tư cách Organizer", id:"Buat Ruang + Bergabung sebagai Penyelenggara" },
};

export function t(key, lang) {
  const entry = T[key];
  if (!entry) return key;
  return entry[lang] || entry["en"] || key;
}
