const panelService = require('../services/panelService');
const pool = require('../config/database');

exports.getActivitySeries = async (req, res) => {
  try {
    const weeks = Math.min(Math.max(parseInt(req.query.weeks, 10) || 53, 4), 104);
    const DAYS = weeks * 7;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(start.getDate() - (DAYS - 1));
    const dayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dayOffset);

    const startIso = start.toISOString().slice(0, 10);

    const [obsRes, aiRes, userRes, syncRes, auditRes, geoRes] = await Promise.all([
      pool.query(`
        SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, COUNT(*)::int as count
        FROM observations.observations
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
      `, [startIso]),
      pool.query(`
        SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, COUNT(*)::int as count
        FROM ai.predictions
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
      `, [startIso]),
      pool.query(`
        SELECT TO_CHAR(d.date, 'YYYY-MM-DD') as date, COUNT(DISTINCT d.user_id)::int as count
        FROM (
          SELECT DATE(created_at) as date, user_id FROM observations.observations WHERE created_at >= $1
          UNION
          SELECT DATE(created_at) as date, id as user_id FROM auth.users WHERE created_at >= $1
        ) d
        GROUP BY d.date
      `, [startIso]),
      pool.query(`
        SELECT TO_CHAR(DATE(COALESCE(recorded_at, created_at)), 'YYYY-MM-DD') as date, COUNT(*)::int as count
        FROM observations.observations
        WHERE status != 'draft' AND created_at >= $1
        GROUP BY DATE(COALESCE(recorded_at, created_at))
      `, [startIso]),
      pool.query(`
        SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, COUNT(*)::int as count
        FROM audit.log
        WHERE (action ILIKE '%paquete%' OR action ILIKE '%dataset%' OR action ILIKE '%region%') AND created_at >= $1
        GROUP BY DATE(created_at)
      `, [startIso]),
      pool.query(`
        SELECT o.id, o.lat, o.lon, o.thumbnail_key,
               COALESCE(o.common_name, ep.nombre_comun, p.top_class, 'Rana') as common_name,
               p.top_class as ai_class,
               u.username,
               o.created_at
        FROM observations.observations o
        JOIN auth.users u ON u.id = o.user_id
        LEFT JOIN ai.predictions p ON p.observation_id = o.id
        LEFT JOIN dataset.especie_publica ep ON lower(replace(p.top_class, '_', ' ')) = lower(ep.nombre_cientifico)
        WHERE o.lat IS NOT NULL AND o.lon IS NOT NULL
        ORDER BY o.created_at DESC
        LIMIT 1000
      `),
    ]);

    const toMap = (rows) => new Map(rows.map((r) => [r.date, r.count]));
    const obsMap = toMap(obsRes.rows);
    const aiMap = toMap(aiRes.rows);
    const userMap = toMap(userRes.rows);
    const syncMap = toMap(syncRes.rows);
    const pkgMap = toMap(auditRes.rows);

    const series = {
      actividad: [],
      usuarios: [],
      observaciones: [],
      identificaciones: [],
      sincronizaciones: [],
      paquetes: [],
    };

    const cur = new Date(start);
    while (cur <= today) {
      const dateStr = cur.toISOString().slice(0, 10);
      const oCount = obsMap.get(dateStr) || 0;
      const aCount = aiMap.get(dateStr) || 0;
      const uCount = userMap.get(dateStr) || 0;
      const sCount = syncMap.get(dateStr) || 0;
      const pCount = pkgMap.get(dateStr) || 0;
      const totCount = oCount + aCount + pCount + (uCount > 0 && oCount === 0 ? 1 : 0);

      series.observaciones.push({ date: dateStr, count: oCount });
      series.identificaciones.push({ date: dateStr, count: aCount });
      series.usuarios.push({ date: dateStr, count: uCount });
      series.sincronizaciones.push({ date: dateStr, count: sCount });
      series.paquetes.push({ date: dateStr, count: pCount });
      series.actividad.push({ date: dateStr, count: totCount });

      cur.setDate(cur.getDate() + 1);
    }

    const geoPoints = geoRes.rows.map((r) => ({
      id: r.id,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      count: 1,
      common_name: r.common_name,
      ai_class: r.ai_class,
      username: r.username,
      thumbnail_key: r.thumbnail_key,
      created_at: r.created_at,
    }));

    res.json({
      series,
      geo: {
        total: geoPoints.length,
        points: geoPoints,
      },
    });
  } catch (err) {
    console.error('[panel] error calculando actividad:', err);
    res.status(500).json({ message: 'Error calculando series de actividad' });
  }
};

exports.getMe = async (req, res) => {
  res.json({ account: req.panelAccount.toJSON() });
};

exports.listAccounts = async (req, res) => {
  const accounts = await panelService.list();
  res.json({ accounts: accounts.map((a) => a.toJSON()) });
};

exports.createAccount = async (req, res) => {
  try {
    const account = await panelService.create(req.body, req.panelAccount);
    res.status(201).json({ account: account.toJSON() });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updatePermission = async (req, res) => {
  try {
    const { action, value } = req.body;
    const account = await panelService.updatePermission(req.params.id, action, value, req.panelAccount);
    res.json({ account: account.toJSON() });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.removeAccount = async (req, res) => {
  try {
    await panelService.remove(req.params.id, req.panelAccount);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
