import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261106120000_correct_prelaunch_activity_content.sql",
  ),
  "utf8",
);

const fixtures = [
  ["VF-0016", "Eat the Fridge First", "instructions 16", "Check expiry dates, trust your senses where appropriate and follow food safety guidance."],
  ["VF-0017", "Leftover Reinvention", "instructions 17", "Cool leftovers quickly, store them safely and reheat thoroughly according to food safety guidance."],
  ["VF-0043", "The Fridge Challenge", "instructions 43", "Check expiry dates and ensure all ingredients are safe to use before cooking."],
  ["VT-0061", "Blind Auction Challenge", "Give every player or team the same number of paper tokens. Prepare 8–12 short challenges and hide each challenge description in a folded card or envelope, showing only a vague teaser such as 'precision', 'nerve' or 'memory'. Auction each challenge before revealing exactly what it is. The winning bidder attempts it; success earns the stated points, while failure earns nothing. Keep enough tokens back for later rounds and finish with a final open auction where everyone knows the challenge. Highest total score wins.", "auction safety"],
  ["UNRELATED", "Untouched activity", "unchanged instructions", "unchanged safety"],
] as const;

async function database() {
  const db = new PGlite();
  await db.exec(`
    create table public.activities (
      id text primary key,
      title text not null,
      instructions text,
      safety_notes text,
      updated_at timestamptz not null default now()
    );
  `);
  for (const row of fixtures) {
    await db.query(
      "insert into public.activities(id,title,instructions,safety_notes) values ($1,$2,$3,$4)",
      [...row],
    );
  }
  return db;
}

test("editorial correction updates only the four reviewed activities", async () => {
  const db = await database();
  try {
    await db.exec(migration);
    const rows = (await db.query<{
      id: string;
      instructions: string;
      safety_notes: string;
    }>("select id,instructions,safety_notes from public.activities order by id")).rows;

    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.match(byId.get("VF-0016")!.safety_notes, /use-by date; do not rely on smell/);
    assert.match(byId.get("VF-0016")!.safety_notes, /rice within one hour/);
    assert.match(byId.get("VF-0017")!.safety_notes, /within 48 hours or freeze/);
    assert.match(byId.get("VF-0017")!.safety_notes, /reheat only once until steaming hot throughout/);
    assert.match(byId.get("VF-0043")!.safety_notes, /Best-before dates relate to quality/);
    assert.doesNotMatch(byId.get("VT-0061")!.instructions, /final open auction/);
    assert.match(byId.get("VT-0061")!.instructions, /chosen lots have been auctioned/);
    assert.deepEqual(byId.get("UNRELATED"), {
      id: "UNRELATED",
      instructions: "unchanged instructions",
      safety_notes: "unchanged safety",
    });
  } finally {
    await db.close();
  }
});

test("editorial correction refuses an unexpected source row and rolls back", async () => {
  const db = await database();
  try {
    await db.query(
      "update public.activities set safety_notes = 'unexpected' where id = 'VF-0017'",
    );
    await assert.rejects(
      db.exec(migration),
      /Expected exactly one unchanged VF-0017 source row/,
    );
    const row = (await db.query<{ safety_notes: string }>(
      "select safety_notes from public.activities where id = 'VF-0016'",
    )).rows[0];
    assert.equal(
      row.safety_notes,
      "Check expiry dates, trust your senses where appropriate and follow food safety guidance.",
    );
  } finally {
    await db.close();
  }
});
