const { push, readBody } = require('./_store');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1545510678142656623/hZOQ8Rsb23OaDsTINDGmWWnl-DQVY1d1zYBiPV89Ny23ZSjaUGuqO8bRDKfZWSKYVAP_';

/* The quiz sends back short codes. These turn them into the words the
   person actually tapped. If a question is edited in index.html,
   update the matching line here too. */
const QUESTIONS = [
  {
    key: 'q1',
    label: "What's your role in the business?",
    options: {
      'owner-crew': 'I own the business and run a crew',
      'owner-solo': "I own the business, it's just me",
      'employee': 'I work for someone else'
    }
  },
  {
    key: 'q2',
    label: 'Which of these have you signed for personally?',
    multi: true
  },
  {
    key: 'q3',
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
    key: 'q4',
    label: 'What have you got in place right now?',
    options: {
      'mortgage-insurance': 'Mortgage insurance through the bank',
      'personal-policy': 'A personal life insurance policy',
      'spouse-work': "Something through my wife's work",
      'nothing': 'Nothing',
      'not-sure': 'Not sure'
    }
  },
  {
    key: 'q5',
    label: "If something happened to you tomorrow, who'd be left holding it?",
    options: {
      'wife': 'My wife',
      'partner': 'My business partner',
      'kids': 'My kids',
      'not-sure': 'Honestly, not sure'
    }
  }
];

function formatAnswers(answers) {
  if (!answers) return '';
  const blocks = [];

  QUESTIONS.forEach((q, i) => {
    const raw = answers[q.key];
    let text;

    if (q.multi) {
      const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      text = list.length ? list.join(', ') : 'No answer';
    } else {
      text = (q.options && q.options[raw]) || raw || 'No answer';
    }

    blocks.push('Q' + (i + 1) + ' : ' + q.label + '\n**' + text + '**');
  });

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

  // Discord rejects anything over 2000 characters
  if (content.length > 1990) content = content.slice(0, 1990) + '...';

  // record first so a Discord outage never loses the lead
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
