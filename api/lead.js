const { push, readBody } = require('./_store');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1545510678142656623/hZOQ8Rsb23OaDsTINDGmWWnl-DQVY1d1zYBiPV89Ny23ZSjaUGuqO8bRDKfZWSKYVAP_';

/* Mirrors the question set in index.html. If a question or option is
   reworded there, reword the matching line here or Discord shows the
   raw code instead of the words he tapped. */
const QUESTIONS = [
  { key: 'q1', label: 'Which of these have you signed for personally?', multi: true },
  {
    key: 'q2',
    label: 'Roughly, what do those add up to?',
    options: {
      'under-100': 'Under $100,000',
      '100-250': '$100,000 - $250,000',
      '250-500': '$250,000 - $500,000',
      'over-500': 'Over $500,000',
      'not-sure': 'Not sure'
    }
  },
  {
    key: 'q3',
    label: 'What have you got in place right now?',
    multi: true,
    options: {
      'mortgage': 'Mortgage insurance through the bank',
      'personal': 'A personal life insurance policy',
      'spouse': "Something through my wife's work",
      'nothing': 'Nothing',
      'unsure': 'Not sure'
    }
  },
  {
    key: 'q4',
    label: "If something happened to you tomorrow, who'd be left holding it?",
    options: {
      'wife': 'My wife',
      'partner': 'My business partner',
      'kids': 'My kids',
      'unsure': 'Honestly, not sure'
    }
  },
  {
    key: 'q5',
    label: 'How old are you?',
    options: { '25-34': '25 - 34', '35-44': '35 - 44', '45-54': '45 - 54', '55+': '55+' }
  }
];

function label(q, raw) {
  if (q.options && q.options[raw]) return q.options[raw];
  return raw;
}

function formatAnswers(a) {
  if (!a) return '';
  const blocks = [];

  QUESTIONS.forEach((q, i) => {
    const raw = a[q.key];
    let text;

    if (q.multi) {
      const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      text = list.length ? list.map(v => label(q, v)).join(', ') : 'No answer';
    } else {
      text = raw ? label(q, raw) : 'No answer';
    }

    blocks.push('Q' + (i + 1) + ' : ' + q.label + '\n**' + text + '**');
  });

  if (a.trade) blocks.push('Trade\n**' + a.trade + '**');

  return blocks.join('\n\n');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = await readBody(req);
  const name = String(b.name || '').slice(0, 120);
  const email = String(b.email || '').slice(0, 160);
  const phone = String(b.phone || '').slice(0, 60);

  let content = [
    '**NEW FACEBOOK LEAD**',
    'name : ' + name,
    'email : ' + email,
    'phone : ' + phone
  ].join('\n');

  const answerBlock = formatAnswers(b.answers);
  if (answerBlock) content += '\n\n' + answerBlock;

  if (content.length > 1990) content = content.slice(0, 1990) + '...';

  try {
    await push({ type: 'lead', sid: String(b.sid || '').slice(0, 40), name, email, phone, answers: b.answers || null, ts: Date.now() });
  } catch (_) {}

  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content, allowed_mentions: { parse: [] } })
    });
  } catch (_) {}

  res.status(200).json({ ok: true });
};
