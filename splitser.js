// splitser.js
// Node.js client + minimal Express API for adding expenses with simple API-key authentication

const express = require('express');
const axios = require('axios');
const chrono = require('chrono-node');
require('dotenv').config();

// === Configuration ===
const LIST_ID = process.env.LIST_ID;
const MASTER_API_KEY = process.env.MASTER_API_KEY;
const DEFAULT_SPLIT_BETWEEN = [
  process.env.DEFAULT_SPLIT_BETWEEN_1,
  process.env.DEFAULT_SPLIT_BETWEEN_2
];

// === Splitser Client ===
class SplitserClient {
  /**
   * @param {{ cookies?: string|object }} options
   */
  constructor({ cookies }) {
    this.baseUrl = `https://app.splitser.com/api/lists/${LIST_ID}/expenses`;
    this.headers = {
      'Accept': 'application/json',
      'Accept-Version': '11',
      'Content-Type': 'application/json',
    };
    // Parse cookies if provided
    if (cookies) {
      if (typeof cookies === 'string') {
        this.cookies = cookies.split(';').reduce((acc, pair) => {
          const [k, v] = pair.trim().split('=', 2);
          if (k && v !== undefined) acc[k] = v;
          return acc;
        }, {});
      } else if (typeof cookies === 'object') {
        this.cookies = cookies;
      } else {
        throw new Error('Invalid cookies format');
      }
    }
  }

  /**
   * @param {Object} params
   * @param {string} params.dateDesc
   * @param {number|string} params.amountEur
   * @param {string} params.description
   * @param {number} [params.categoryId]
   * @param {string} [params.payerId]
   * @param {Array<Object>} [params.sharesAttributes] - Optional, custom shares structure
   * @param {Array<string>} [params.splitBetween] - Optional, member_ids to split between
   */
  async addExpense({ dateDesc, amountEur, description, categoryId, payerId, sharesAttributes, splitBetween }) {
    // Parse natural language date
    const parsedDate = chrono.parseDate(dateDesc, new Date(), { forwardDate: true });
    if (!parsedDate) throw new Error(`Could not parse date: ${dateDesc}`);
    const dateStr = parsedDate.toISOString().slice(0, 10);

    // Convert amount
    const amountValue = Number(amountEur);
    if (isNaN(amountValue)) throw new Error(`Invalid amount: ${amountEur}`);
    const amountCents = Math.round(amountValue * 100);

    // Use default split if splitBetween not provided or invalid
    let split = splitBetween;
    if (!Array.isArray(split) || split.length !== 2) {
      split = DEFAULT_SPLIT_BETWEEN;
    }

    // Build shares_attributes: if provided, use that, else split 50/50 between two members
    let shares = sharesAttributes;
    if (!Array.isArray(shares)) {
      const [id1, id2] = split;
      const part = Math.floor(amountCents / 2);
      const remainder = amountCents % 2;
      shares = [
        {
          id: id1,
          member_id: id1,
          meta: { type: 'factor', multiplier: 1 },
          source_amount: { fractional: part + remainder, currency: 'EUR' }
        },
        {
          id: id2,
          member_id: id2,
          meta: { type: 'factor', multiplier: 1 },
          source_amount: { fractional: part, currency: 'EUR' }
        }
      ];
    }

    // Build payload
    const payload = {
      expense: {
        category: { id: categoryId || 999999999, category_source: 'auto' },
        name: description,
        payed_by_id: payerId,
        payed_on: dateStr,
        source_amount: { fractional: amountCents, currency: 'EUR' },
        amount: { fractional: amountCents, currency: 'EUR' },
        exchange_rate: 1,
        shares_attributes: shares,
        recurring_task: { execute_at: '21:14:50+02:00', frequency: 'never', reminder_offset: 'remind_never' }
      }
    };

    // Options for axios, include cookies header if set
    const options = {
      headers: this.headers
    };
    if (this.cookies) {
      const cookieHeader = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      options.headers['Cookie'] = cookieHeader;
    }

    const response = await axios.post(this.baseUrl, payload, options);
    return response.data;
  }
}

// === Express API ===
const app = express();
app.use(express.json());

// Public routes (no auth required)
app.get('/', (_, res) => res.send('ok'));
app.use('/.well-known', express.static('public/.well-known'));
app.get('/openapi.yaml', (req, res) =>
  res.sendFile('public/openapi.yaml', { root: __dirname }));

// API key authentication middleware for all other routes
app.use((req, res, next) => {
  const key = req.header('x-api-key');
  if (key !== MASTER_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Protected routes (require auth)
app.post('/addExpense', async (req, res) => {
  try {
    const { dateDesc, amountEur, description, categoryId, payerId, cookies, sharesAttributes, splitBetween } = req.body;
    const client = new SplitserClient({ cookies });
    const result = await client.addExpense({ dateDesc, amountEur, description, categoryId, payerId, sharesAttributes, splitBetween });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Splitser API listening on port ${PORT}`));

/*
.env example:
MASTER_API_KEY=supersecretkey123
*/
