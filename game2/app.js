/* 情報処理安全確保支援士 科目A ドリル */
(() => {
  'use strict';

  // ---------- 定数 ----------
  const SUBJ = {
    A1: { name: '科目A-1', old: '旧午前Ⅰ', n: 30, min: 50 },
    A2: { name: '科目A-2', old: '旧午前Ⅱ', n: 25, min: 40 },
  };
  const PASS_RATE = 0.6; // 基準点 60点（100点満点）
  const CHOICES = ['ア', 'イ', 'ウ', 'エ'];
  const MODES = [
    { id: 'real', ico: '🎯', title: '本番モード', desc: '本番と同じ問題数・試験時間' },
    { id: 'focus', ico: '📝', title: '集中小テスト', desc: '25分でしっかり演習', minutes: 25 },
    { id: 'quick', ico: '⚡', title: 'サクッと', desc: '空き時間に10分', minutes: 10 },
    { id: 'custom', ico: '⚙️', title: 'カスタム', desc: '時間を指定（問題数は自動）' },
  ];
  const KEY_CUR = 'riss.current';
  const KEY_HIST = 'riss.history';
  const KEY_STATS = 'riss.stats';
  const KEY_PREFS = 'riss.prefs';

  const EXAMS = window.QDATA.exams;
  const EXAM = Object.fromEntries(EXAMS.map(e => [e.id, e]));
  const SESSIONS = [];
  for (const e of EXAMS) if (!SESSIONS.find(s => s.id === e.session)) SESSIONS.push({ id: e.session, label: e.label, short: e.short });
  const CATS = window.QCAT.cats;
  const CAT = Object.fromEntries(CATS.map(c => [c.code, c]));
  const catOf = q => CAT[window.QCAT.map[q.exam][q.n - 1]];
  const GROUPS = ['セキュリティ', 'テクノロジ', 'マネジメント', 'ストラテジ'];

  // ---------- 小物 ----------
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存不可でも続行 */ } },
    del(k) { try { localStorage.removeItem(k); } catch { } },
  };
  const subjectsOf = key => key === 'AB' ? ['A1', 'A2'] : [key];
  const perQ = key => { const ss = subjectsOf(key); return ss.reduce((a, s) => a + SUBJ[s].min, 0) / ss.reduce((a, s) => a + SUBJ[s].n, 0); };
  const imgSrc = q => `img/${q.exam}/q${String(q.n).padStart(2, '0')}.png`;
  const srcLabel = q => { const e = EXAM[q.exam]; return `${e.label} ${SUBJ[e.subject].old} 問${q.n}`; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg, ms = 2200) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }
  function show(id) {
    for (const s of ['home', 'quiz', 'result']) $('#' + s).hidden = s !== id;
    window.scrollTo(0, 0);
  }

  // ---------- 合格予想（ベータ二項分布） ----------
  function lgamma(x) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
  // 正答数 c / 誤答数 w から、本番 N 問での得点分布を推定（一様事前分布）
  function predict(c, w, subject) {
    const N = SUBJ[subject].n, a = 1 + c, b = 1 + w, need = Math.ceil(N * PASS_RATE);
    const pmf = [];
    for (let k = 0; k <= N; k++) pmf.push(Math.exp(lgamma(N + 1) - lgamma(k + 1) - lgamma(N - k + 1) + lbeta(k + a, N - k + b) - lbeta(a, b)));
    let pass = 0, cum = 0, lo = null, hi = null;
    pmf.forEach((p, k) => {
      if (k >= need) pass += p;
      cum += p;
      if (lo === null && cum >= 0.1) lo = k;
      if (hi === null && cum >= 0.9) hi = k;
    });
    return {
      score: Math.round(a / (a + b) * 100),
      lo: Math.round(lo / N * 100), hi: Math.round(hi / N * 100),
      pass: Math.min(99, Math.max(1, Math.round(pass * 100))),
    };
  }

  // ---------- ホーム画面 ----------
  const prefs = Object.assign({
    subject: 'A1', range: 'single', single: SESSIONS[0].id, mix: SESSIONS.map(s => s.id),
    mode: 'real', customMin: 20, instant: false, shuffle: false, weak: false,
  }, store.get(KEY_PREFS, {}));
  const savePrefs = () => store.set(KEY_PREFS, prefs);

  function poolFor(p) {
    const sess = p.range === 'single' ? [p.single] : p.mix;
    const subs = subjectsOf(p.subject);
    const qs = [];
    for (const e of EXAMS) {
      if (!sess.includes(e.session) || !subs.includes(e.subject)) continue;
      for (let i = 0; i < e.answers.length; i++) qs.push({ id: `${e.id}-${i + 1}`, exam: e.id, n: i + 1, ans: e.answers[i] });
    }
    return qs;
  }
  function planFor(p) {
    const pool = poolFor(p);
    const pq = perQ(p.subject);
    let n, minutes;
    if (p.mode === 'real') {
      minutes = subjectsOf(p.subject).reduce((a, s) => a + SUBJ[s].min, 0);
      n = subjectsOf(p.subject).reduce((a, s) => a + SUBJ[s].n, 0);
    } else {
      minutes = p.mode === 'custom' ? p.customMin : MODES.find(m => m.id === p.mode).minutes;
      n = Math.max(1, Math.round(minutes / pq));
    }
    if (n > pool.length) n = pool.length;
    return { pool, n, minutes };
  }

  function renderHome() {
    $$('#subjectSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === prefs.subject));
    $$('#rangeSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === prefs.range));
    const single = prefs.range === 'single';
    $('#sessionChips').innerHTML = SESSIONS.map(s => {
      const on = single ? prefs.single === s.id : prefs.mix.includes(s.id);
      return `<button class="chip${on ? ' on' : ''}" data-s="${s.id}" aria-pressed="${on}">${esc(s.label)}<small>${single ? '1回分' : (on ? '✓ 出題範囲' : '対象外')}</small></button>`;
    }).join('');
    $('#rangeHint').textContent = single
      ? '選んだ回の問題から出題します。本番モードでは問1から順に全問出題します。'
      : '選んだ回（複数可）からランダムに出題します。';

    $('#modeList').innerHTML = MODES.map(m => {
      const plan = planFor({ ...prefs, mode: m.id });
      const spec = `${plan.n}問 / ${plan.minutes}分`;
      return `<button class="mode${prefs.mode === m.id ? ' on' : ''}" data-m="${m.id}">
        <span class="m-ico">${m.ico}</span>
        <span class="m-main"><span class="m-title">${m.title}</span><span class="m-desc">${m.desc}</span></span>
        <span class="m-spec">${spec}</span></button>`;
    }).join('');
    $('#customBox').hidden = prefs.mode !== 'custom';
    $('#customMin').value = prefs.customMin;
    $('#customMinOut').textContent = prefs.customMin;
    $('#optInstant').checked = prefs.instant;
    $('#optShuffle').checked = prefs.shuffle;
    $('#optWeak').checked = prefs.weak;

    const plan = planFor(prefs);
    const subjTxt = prefs.subject === 'AB' ? '科目A-1＋A-2' : `${SUBJ[prefs.subject].name}（${SUBJ[prefs.subject].old}）`;
    const rangeTxt = single ? SESSIONS.find(s => s.id === prefs.single).label : `ミックス（${prefs.mix.length}回分）`;
    const ok = plan.pool.length > 0;
    $('#startSummary').innerHTML = ok
      ? `${esc(subjTxt)}・${esc(rangeTxt)}<br><b>${plan.n}問 / ${plan.minutes}分</b>（1問あたり約${(plan.minutes / plan.n).toFixed(1)}分）`
      : '出題範囲を1つ以上選んでください';
    $('#startBtn').disabled = !ok;

    const cur = store.get(KEY_CUR, null);
    $('#resume').hidden = !cur;
    if (cur) {
      const left = cur.deadline - Date.now();
      $('#resumeInfo').textContent = `${cur.title}・${Object.keys(cur.answers).length}/${cur.qs.length}問解答済・` + (left > 0 ? `残り ${fmtTime(left)}` : '時間切れ（再開すると採点します）');
    }
    renderHistory();
  }

  function renderHistory() {
    const hist = store.get(KEY_HIST, []);
    const body = $('#historyBody');
    const all = aggAll();
    $('#homeWeakCard').hidden = !Object.keys(all).length;
    if (Object.keys(all).length) renderWeak($('#homeWeak'), all, 3);
    if (!hist.length) { body.innerHTML = '<p class="muted">まだ記録がありません。テストを終えるとここに成績と合格予想が表示されます。</p>'; return; }
    const agg = { A1: { c: 0, n: 0 }, A2: { c: 0, n: 0 } };
    for (const h of hist.slice(0, 30)) for (const s in h.per) { agg[s].c += h.per[s].c; agg[s].n += h.per[s].n; }
    let stats = '';
    for (const s of ['A1', 'A2']) {
      if (!agg[s].n) continue;
      const pr = predict(agg[s].c, agg[s].n - agg[s].c, s);
      stats += `<div class="stat"><div class="k">${SUBJ[s].name}（${SUBJ[s].old}）累計</div>
        <div class="v">${pr.score}<small>点予想</small></div>
        <div class="s">正答率 ${Math.round(agg[s].c / agg[s].n * 100)}%（${agg[s].c}/${agg[s].n}問）・合格率 ${pr.pass}%</div>
        <div class="bar"><div style="width:${pr.pass}%"></div></div></div>`;
    }
    const rows = hist.slice(0, 10).map(h => `<tr><td>${fmtDate(h.t)}</td><td>${esc(h.title)}</td><td class="r">${h.score}点</td>
      <td class="${h.pass ? 'pass' : 'fail'}">${h.pass ? '合格' : '不合格'}</td></tr>`).join('');
    body.innerHTML = `<div class="hist-stats">${stats}</div>
      <table class="hist-table"><thead><tr><th>日時</th><th>内容</th><th class="r">得点</th><th>判定</th></tr></thead><tbody>${rows}</tbody></table>
      <button class="link-btn" id="clearHist">成績・学習記録をリセット</button>`;
    $('#clearHist').onclick = () => {
      if (!confirm('これまでの成績と学習記録をすべて削除します。よろしいですか？')) return;
      store.del(KEY_HIST); store.del(KEY_STATS); renderHome();
    };
  }

  $('#subjectSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; prefs.subject = b.dataset.v; savePrefs(); renderHome(); });
  $('#rangeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; prefs.range = b.dataset.v; savePrefs(); renderHome(); });
  $('#sessionChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const s = b.dataset.s;
    if (prefs.range === 'single') prefs.single = s;
    else prefs.mix = prefs.mix.includes(s) ? prefs.mix.filter(x => x !== s) : SESSIONS.map(x => x.id).filter(x => x === s || prefs.mix.includes(x));
    savePrefs(); renderHome();
  });
  $('#modeList').addEventListener('click', e => { const b = e.target.closest('.mode'); if (!b) return; prefs.mode = b.dataset.m; savePrefs(); renderHome(); });
  $('#customMin').addEventListener('input', e => { prefs.customMin = +e.target.value; savePrefs(); renderHome(); });
  $('#optInstant').addEventListener('change', e => { prefs.instant = e.target.checked; savePrefs(); });
  $('#optShuffle').addEventListener('change', e => { prefs.shuffle = e.target.checked; savePrefs(); });
  $('#optWeak').addEventListener('change', e => { prefs.weak = e.target.checked; savePrefs(); });

  $('#startBtn').addEventListener('click', () => {
    if (store.get(KEY_CUR, null) && !confirm('中断中のテストは破棄されます。新しく始めますか？')) return;
    const plan = planFor(prefs);
    const ordered = prefs.mode === 'real' && prefs.range === 'single';
    let qs;
    if (ordered) qs = plan.pool.slice();
    else if (prefs.weak) qs = byWeakness(plan.pool).slice(0, plan.n);
    else qs = shuffle(plan.pool.slice()).slice(0, plan.n);
    if (prefs.shuffle) shuffle(qs);
    else if (!ordered) qs.sort((a, b) => EXAMS.indexOf(EXAM[a.exam]) - EXAMS.indexOf(EXAM[b.exam]) || a.n - b.n);
    const modeTitle = MODES.find(m => m.id === prefs.mode).title;
    const rangeTxt = prefs.range === 'single' ? SESSIONS.find(s => s.id === prefs.single).short : 'ミックス';
    const subjTxt = prefs.subject === 'AB' ? 'A-1+A-2' : SUBJ[prefs.subject].name.replace('科目', '');
    startQuiz({ qs, minutes: plan.minutes, title: `${subjTxt} ${rangeTxt} ${modeTitle}`, instant: prefs.instant });
  });
  // 未出題 → 前回不正解 → 正答率の低い順（同順位はランダム）
  function byWeakness(pool) {
    const st = store.get(KEY_STATS, {});
    const pri = q => { const s = st[q.id]; if (!s) return 0; if (!s.last) return 1; return 2 + s.c / s.n; };
    return shuffle(pool.slice()).sort((a, b) => pri(a) - pri(b));
  }

  // ---------- 弱点分析 ----------
  // 分野ごとの { n: 解答数, c: 正解数 } を集計
  function aggNow(R) {
    const agg = {};
    for (const q of R.qs) {
      const k = catOf(q).code; agg[k] = agg[k] || { n: 0, c: 0 };
      agg[k].n++; if (R.answers[q.id] === q.ans) agg[k].c++;
    }
    return agg;
  }
  function aggAll() {
    const st = store.get(KEY_STATS, {}), agg = {};
    for (const [id, s] of Object.entries(st)) {
      const i = id.lastIndexOf('-'), exam = id.slice(0, i), n = +id.slice(i + 1);
      if (!window.QCAT.map[exam]) continue;
      const k = catOf({ exam, n }).code; agg[k] = agg[k] || { n: 0, c: 0 };
      agg[k].n += s.n; agg[k].c += s.c;
    }
    return agg;
  }
  // minN: この解答数以上の分野だけを「弱点」と判定する
  function renderWeak(el, agg, minN) {
    const rows = Object.entries(agg).map(([k, a]) => ({ cat: CAT[k], ...a, pct: Math.round(a.c / a.n * 100) }))
      .sort((x, y) => (y.pct < 60 && y.n >= minN) - (x.pct < 60 && x.n >= minN) || x.pct - y.pct || y.n - x.n);
    if (!rows.length) { el.innerHTML = '<p class="muted">まだデータがありません。</p>'; return; }
    const weak = rows.filter(r => r.pct < 60 && r.n >= minN);
    const groups = GROUPS.map(g => {
      const a = rows.filter(r => r.cat.group === g).reduce((s, r) => ({ n: s.n + r.n, c: s.c + r.c }), { n: 0, c: 0 });
      return a.n ? `<div class="stat"><div class="k">${g}</div><div class="v">${Math.round(a.c / a.n * 100)}<small>%</small></div>
        <div class="s">${a.c}/${a.n}問</div><div class="bar"><div style="width:${a.c / a.n * 100}%;background:${a.c / a.n >= 0.6 ? 'var(--ok)' : 'var(--ng)'}"></div></div></div>` : '';
    }).join('');
    const summary = weak.length
      ? `<p class="weak-msg ng">弱点：<b>${weak.slice(0, 3).map(r => esc(r.cat.name)).join('、')}</b>${weak.length > 3 ? ` ほか${weak.length - 3}分野` : ''}<br>
         正答率が60%を下回っています。「練習」で、その分野の問題だけを解き直せます。</p>`
      : `<p class="weak-msg ok">正答率60%未満の分野はありません${rows.some(r => r.n < minN) ? '（解答数の少ない分野は判定していません）' : ''}。</p>`;
    el.innerHTML = summary + `<div class="stats weak-groups">${groups}</div>` + rows.map(r => {
      const isWeak = r.pct < 60 && r.n >= minN;
      return `<div class="wk-row${isWeak ? ' weak' : ''}">
        <div class="wk-name">${isWeak ? '<span class="badge">弱点</span>' : ''}${esc(r.cat.name)}</div>
        <div class="wk-val">${r.c}/${r.n}（${r.pct}%）</div>
        <button class="btn small ghost wk-btn" data-cat="${r.cat.code}">練習</button>
        <div class="bar"><div style="width:${r.pct}%;background:${r.pct >= 60 ? 'var(--ok)' : 'var(--ng)'}"></div></div></div>`;
    }).join('') + '<p class="hint">分野は IPA シラバスの中分類をもとに分けています。「今回」はこのテストの結果、「累計」はこれまでに解いたすべての結果です。</p>';
  }
  function startCategory(code) {
    const pool = [];
    for (const e of EXAMS) for (let i = 0; i < e.answers.length; i++) {
      const q = { id: `${e.id}-${i + 1}`, exam: e.id, n: i + 1, ans: e.answers[i] };
      if (catOf(q).code === code) pool.push(q);
    }
    const qs = byWeakness(pool).slice(0, 10);
    const min = qs.reduce((a, q) => a + SUBJ[EXAM[q.exam].subject].min / SUBJ[EXAM[q.exam].subject].n, 0);
    if (store.get(KEY_CUR, null) && !confirm('中断中のテストは破棄されます。新しく始めますか？')) return;
    startQuiz({ qs, minutes: Math.max(1, Math.ceil(min)), title: `弱点練習：${CAT[code].name}`, instant: true });
  }
  document.addEventListener('click', e => { const b = e.target.closest('.wk-btn'); if (b) startCategory(b.dataset.cat); });
  $('#weakSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#weakSeg button').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.v === 'now') renderWeak($('#weakBody'), aggNow(lastResult), 2);
    else renderWeak($('#weakBody'), aggAll(), 3);
  });

  $('#resumeBtn').addEventListener('click', () => { Q = store.get(KEY_CUR, null); if (Q) enterQuiz(); });
  $('#discardBtn').addEventListener('click', () => { if (confirm('中断中のテストを破棄しますか？')) { store.del(KEY_CUR); renderHome(); } });

  // ---------- 受験画面 ----------
  let Q = null; // 現在のテスト
  let tick = null;

  function startQuiz({ qs, minutes, title, instant }) {
    const now = Date.now();
    Q = { qs, minutes, title, instant, start: now, deadline: now + minutes * 60000, answers: {}, flags: {}, cur: 0 };
    saveQ(); enterQuiz();
  }
  const saveQ = () => store.set(KEY_CUR, Q);

  function enterQuiz() {
    if (Date.now() >= Q.deadline) { finish(true); return; }
    show('quiz'); renderQ(); startTimer();
  }

  function startTimer() {
    clearInterval(tick);
    const total = Q.minutes * 60000;
    const warnAt = total >= 15 * 60000 ? 5 * 60000 : 2 * 60000;
    let warned = false;
    const upd = () => {
      const left = Q.deadline - Date.now();
      const tm = $('#timer'), bar = $('.tbar');
      tm.textContent = fmtTime(left);
      const st = left <= 60000 ? 'danger' : left <= warnAt ? 'warn' : '';
      tm.className = 'timer ' + st; bar.className = 'tbar ' + st;
      $('#tbarFill').style.transform = `scaleX(${Math.max(0, left / total)})`;
      document.title = `${fmtTime(left)}｜支援士 科目A`;
      if (st && !warned) { warned = true; toast(`残り ${Math.ceil(left / 60000)} 分です`); }
      if (left <= 0) { clearInterval(tick); toast('時間終了！採点します', 2500); finish(true); }
    };
    upd(); tick = setInterval(upd, 250);
  }

  function renderQ() {
    const q = Q.qs[Q.cur];
    $('#qpos').textContent = `${Q.cur + 1} / ${Q.qs.length}`;
    $('#qsrc').textContent = `出典：${srcLabel(q)}`;
    const img = $('#qimg'); img.src = imgSrc(q); img.alt = `${srcLabel(q)} の問題`;
    const fb = $('#flagBtn'); const fl = !!Q.flags[q.id];
    fb.setAttribute('aria-pressed', fl); fb.textContent = fl ? '★ 見直し' : '☆ 見直し';
    const sel = Q.answers[q.id];
    const locked = Q.instant && sel;
    $$('#choices button').forEach(b => {
      const c = b.dataset.c;
      b.className = '';
      b.disabled = !!locked;
      if (locked) { if (c === q.ans) b.classList.add('correct'); else if (c === sel) b.classList.add('wrong'); }
      else if (c === sel) b.classList.add('sel');
    });
    const f = $('#feedback');
    if (locked) {
      const ok = sel === q.ans;
      f.hidden = false; f.className = 'feedback ' + (ok ? 'ok' : 'ng');
      f.textContent = ok ? `⭕ 正解！（正解：${q.ans}）` : `❌ 不正解（あなた：${sel} ／ 正解：${q.ans}）`;
    } else f.hidden = true;
    $('#prevBtn').disabled = Q.cur === 0;
    $('#nextBtn').textContent = Q.cur === Q.qs.length - 1 ? '採点 ›' : '次へ ›';
    // 次の問題画像を先読み
    const nx = Q.qs[Q.cur + 1]; if (nx) new Image().src = imgSrc(nx);
  }

  function choose(c) {
    const q = Q.qs[Q.cur];
    if (Q.instant && Q.answers[q.id]) return;
    if (!Q.instant && Q.answers[q.id] === c) delete Q.answers[q.id];
    else Q.answers[q.id] = c;
    saveQ(); renderQ();
    if (!Q.instant && Q.answers[q.id] && Q.cur < Q.qs.length - 1) setTimeout(() => { if (Q && Q.qs[Q.cur] === q) go(1); }, 220);
  }
  function go(d) {
    const i = Q.cur + d;
    if (i < 0) return;
    if (i >= Q.qs.length) { askFinish(); return; }
    Q.cur = i; saveQ(); renderQ(); window.scrollTo(0, 0);
  }
  function askFinish() {
    const un = Q.qs.filter(q => !Q.answers[q.id]).length;
    const msg = un ? `未解答が ${un} 問あります。採点しますか？` : '採点しますか？';
    if (confirm(msg)) finish(false);
  }

  $('#choices').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) choose(b.dataset.c); });
  $('#prevBtn').addEventListener('click', () => go(-1));
  $('#nextBtn').addEventListener('click', () => go(1));
  $('#finishBtn').addEventListener('click', askFinish);
  $('#flagBtn').addEventListener('click', () => {
    const id = Q.qs[Q.cur].id; if (Q.flags[id]) delete Q.flags[id]; else Q.flags[id] = 1; saveQ(); renderQ();
  });
  $('#quitBtn').addEventListener('click', () => {
    if (!confirm('ホームに戻ります。テストは中断として保存され、後で再開できます（制限時間は進み続けます）。')) return;
    clearInterval(tick); document.title = '支援士 科目A ドリル'; Q = null; show('home'); renderHome();
  });

  // 問題一覧
  function openPalette() {
    $('#paletteGrid').innerHTML = Q.qs.map((q, i) => {
      const cls = [Q.answers[q.id] ? 'ans' : '', Q.flags[q.id] ? 'flagged' : '', i === Q.cur ? 'cur' : ''].join(' ');
      return `<button class="${cls}" data-i="${i}" aria-label="${i + 1}問目">${i + 1}</button>`;
    }).join('');
    $('#palette').hidden = false;
  }
  $('#paletteBtn').addEventListener('click', openPalette);
  $('#paletteGrid').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    Q.cur = +b.dataset.i; saveQ(); renderQ(); $('#palette').hidden = true; window.scrollTo(0, 0);
  });
  $('#paletteFinish').addEventListener('click', () => { $('#palette').hidden = true; askFinish(); });

  // 拡大表示
  let zoomLv = 1;
  const ZOOMS = [1, 1.5, 2, 2.6];
  function openZoom(src) {
    zoomLv = window.innerWidth < 700 ? 1 : 0;
    $('#zoomImg').src = src; applyZoom(); $('#zoom').hidden = false;
  }
  const applyZoom = () => { $('#zoomImg').style.width = ZOOMS[zoomLv] * 100 + '%'; };
  $('#qfig').addEventListener('click', () => openZoom($('#qimg').src));
  $('#zoomIn').addEventListener('click', () => { zoomLv = Math.min(ZOOMS.length - 1, zoomLv + 1); applyZoom(); });
  $('#zoomOut').addEventListener('click', () => { zoomLv = Math.max(0, zoomLv - 1); applyZoom(); });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]') || e.target.classList.contains('sheet')) {
      $('#palette').hidden = true; $('#zoom').hidden = true;
    }
  });

  // キーボード（PC）
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { $('#palette').hidden = true; $('#zoom').hidden = true; return; }
    if ($('#quiz').hidden || !$('#palette').hidden || !$('#zoom').hidden) return;
    const k = e.key.toLowerCase();
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
    if (k in map) { choose(CHOICES[map[k]]); e.preventDefault(); }
    else if (k === 'arrowright') go(1);
    else if (k === 'arrowleft') go(-1);
    else if (k === 'f') $('#flagBtn').click();
  });

  // ---------- 採点・結果 ----------
  let lastResult = null;

  function finish(timeUp) {
    clearInterval(tick);
    document.title = '支援士 科目A ドリル';
    const usedMs = Math.min(Date.now(), Q.deadline) - Q.start;
    const per = {}, bySess = {};
    const stats = store.get(KEY_STATS, {});
    let c = 0;
    for (const q of Q.qs) {
      const e = EXAM[q.exam], s = e.subject, ok = Q.answers[q.id] === q.ans;
      per[s] = per[s] || { n: 0, c: 0 }; per[s].n++;
      const sk = `${e.label} ${SUBJ[s].name}`;
      bySess[sk] = bySess[sk] || { n: 0, c: 0 }; bySess[sk].n++;
      if (ok) { c++; per[s].c++; bySess[sk].c++; }
      const st = stats[q.id] || { n: 0, c: 0 };
      st.n++; if (ok) st.c++; st.last = ok ? 1 : 0; stats[q.id] = st;
    }
    const score = Math.round(c / Q.qs.length * 100);
    const pass = Object.values(per).every(p => p.c / p.n >= PASS_RATE);
    const rec = { t: Date.now(), title: Q.title, n: Q.qs.length, c, score, pass, per, timeUp, usedMs };
    const hist = store.get(KEY_HIST, []); hist.unshift(rec); store.set(KEY_HIST, hist.slice(0, 200));
    store.set(KEY_STATS, stats);
    store.del(KEY_CUR);
    lastResult = { ...rec, qs: Q.qs, answers: Q.answers, bySess, minutes: Q.minutes };
    Q = null;
    renderResult();
  }

  function renderResult() {
    const R = lastResult;
    show('result');
    const v = $('#verdict'); v.className = 'verdict ' + (R.pass ? 'pass' : 'fail');
    v.textContent = R.pass ? '合格ライン到達' : '合格ライン未達';
    $('#scoreNum').textContent = R.score;
    const used = Math.round(R.usedMs / 1000);
    $('#scoreDetail').innerHTML = `${R.c} / ${R.n} 問正解・解答時間 ${Math.floor(used / 60)}分${used % 60}秒（制限 ${R.minutes}分）${R.timeUp ? '<br>⏰ 時間切れで自動採点しました' : ''}`;
    requestAnimationFrame(() => { $('#gaugeFill').style.width = R.score + '%'; $('#gaugeFill').style.background = R.pass ? 'var(--ok)' : 'var(--accent)'; });

    // 合格予想
    const hist = store.get(KEY_HIST, []);
    let html = '';
    for (const s of Object.keys(R.per).sort()) {
      const p = R.per[s];
      const now = predict(p.c, p.n - p.c, s);
      const agg = { c: 0, n: 0 };
      for (const h of hist.slice(0, 30)) if (h.per[s]) { agg.c += h.per[s].c; agg.n += h.per[s].n; }
      const cum = predict(agg.c, agg.n - agg.c, s);
      const subScore = Math.round(p.c / p.n * 100);
      html += `
        <div class="stat"><div class="k">${SUBJ[s].name}（${SUBJ[s].old}）今回の得点</div>
          <div class="v">${subScore}<small>点</small></div><div class="s">${p.c}/${p.n}問・合格ライン60点</div></div>
        <div class="stat"><div class="k">合格予想点数（本番${SUBJ[s].n}問換算）</div>
          <div class="v">${now.score}<small>点</small></div><div class="s">80%の確率で ${now.lo}〜${now.hi}点</div></div>
        <div class="stat"><div class="k">合格率（今回の結果から）</div>
          <div class="v">${now.pass}<small>%</small></div><div class="bar"><div style="width:${now.pass}%"></div></div></div>
        <div class="stat"><div class="k">累計ベースの予想（直近${agg.n}問）</div>
          <div class="v">${cum.score}<small>点</small></div><div class="s">合格率 ${cum.pass}%</div><div class="bar"><div style="width:${cum.pass}%"></div></div></div>`;
    }
    $('#predict').innerHTML = html;
    $('#predictNote').textContent = '合格予想点数・合格率は、正答数から推定した実力（ベイズ推定）をもとに、本番（A-1は30問、A-2は25問）で基準点60点以上をとる確率を計算したものです。問題数が少ないほど予想の幅が広くなります。';

    // 内訳
    const rows = Object.entries(R.bySess).map(([k, p]) => {
      const pc = Math.round(p.c / p.n * 100);
      return `<div class="bd-row"><span>${esc(k)}</span><span>${p.c}/${p.n}（${pc}%）</span><div class="bar"><div style="width:${pc}%;background:${pc >= 60 ? 'var(--ok)' : 'var(--ng)'}"></div></div></div>`;
    }).join('');
    $('#breakdown').innerHTML = rows;
    $('#breakdownCard').hidden = Object.keys(R.bySess).length < 2;

    $$('#weakSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === 'now'));
    renderWeak($('#weakBody'), aggNow(R), 2);

    renderReview('all');
    $('#retryWrongBtn').hidden = R.c === R.n;
  }

  function renderReview(filter) {
    const R = lastResult;
    $$('#reviewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === filter));
    const items = R.qs.map((q, i) => ({ q, i, a: R.answers[q.id] })).filter(x => filter === 'all' || x.a !== x.q.ans);
    $('#reviewList').innerHTML = items.length ? items.map(({ q, i, a }) => {
      const ok = a === q.ans;
      return `<details class="rv"><summary>
        <span class="mark ${ok ? 'ok' : 'ng'}">${ok ? '○' : '×'}</span>
        <span class="t">${i + 1}問目<small>${esc(srcLabel(q))}・${esc(catOf(q).name)}</small></span>
        <span class="a">あなた <b>${a || '―'}</b>／正解 <b>${q.ans}</b></span></summary>
        <div class="body"><figure class="qimg"><img data-src="${imgSrc(q)}" alt="${esc(srcLabel(q))} の問題"><figcaption>タップで拡大</figcaption></figure></div></details>`;
    }).join('') : '<p class="muted">全問正解です！🎉</p>';
  }
  $('#reviewSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) renderReview(b.dataset.v); });
  $('#reviewList').addEventListener('toggle', e => {
    const img = e.target.querySelector && e.target.querySelector('img[data-src]');
    if (img && e.target.open) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  }, true);
  $('#reviewList').addEventListener('click', e => { const f = e.target.closest('.qimg'); if (f) openZoom(f.querySelector('img').src); });

  $('#retryWrongBtn').addEventListener('click', () => {
    const R = lastResult;
    const qs = R.qs.filter(q => R.answers[q.id] !== q.ans);
    const pq = qs.reduce((a, q) => a + SUBJ[EXAM[q.exam].subject].min / SUBJ[EXAM[q.exam].subject].n, 0);
    startQuiz({ qs, minutes: Math.max(1, Math.ceil(pq)), title: `解き直し（${qs.length}問）`, instant: true });
  });
  $('#homeBtn').addEventListener('click', () => { show('home'); renderHome(); });

  // 他のタブ・アプリから戻ったときにタイマーを即時更新（iOS のバックグラウンド対策）
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Q && !$('#quiz').hidden) startTimer(); });

  // ---------- 起動 ----------
  renderHome();
})();
