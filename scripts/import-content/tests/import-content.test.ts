import assert from "node:assert/strict";
import test from "node:test";

import {
  auditActivityEnvironmentConsistency,
  mapActivityRecord,
  mapResourceRecord,
  parseActivityRelationships,
} from "../src/source.js";
import type { ValidationDetail } from "../src/types.js";
import { compareSourceSets, formatVerificationFailure } from "../src/verification.js";

test("maps activity fields and the final source status deterministically", () => {
  const problems: ValidationDetail[] = [];
  const activity = mapActivityRecord({
    ID: "VK-2-4-0001",
    Type: "Activity",
    Section: "Vital Kids",
    Title: "Test activity",
    Indoor: "true",
    Outdoor: "false",
    Tags: "nature; movement",
    Collections: "Outdoors; Weekend",
    Status: "Research Complete",
  }, (problem) => problems.push(problem));

  assert.equal(activity.id, "VK-2-4-0001");
  assert.equal(activity.status, "published");
  assert.equal(activity.indoor, true);
  assert.equal(activity.outdoor, false);
  assert.deepEqual(activity.tags, ["nature", "movement"]);
  assert.deepEqual(activity.collection_labels, ["Outdoors", "Weekend"]);
  assert.deepEqual(problems, []);
});

test("normalizes the repeated outdoor-only source flag from explicit evidence", () => {
  const indoor = mapActivityRecord({
    ID: "VF-0031",
    Type: "Activity",
    Section: "Vital Food",
    Title: "Acid Before Salt",
    Indoor: "false",
    Outdoor: "true",
    Weather: "Kitchen",
    Status: "Research Complete",
  });
  const outdoor = mapActivityRecord({
    ID: "VK-8-10-0001",
    Type: "Activity",
    Section: "Vital Kids",
    Title: "Trail activity",
    Summary: "Explore outdoors and notice what changes.",
    Indoor: "false",
    Outdoor: "true",
    Status: "Research Complete",
  });
  const both = mapActivityRecord({
    ID: "VK-5-7-0001",
    Type: "Activity",
    Section: "Vital Kids",
    Title: "Move anywhere",
    Indoor: "false",
    Outdoor: "true",
    Tags: "indoors; outdoors",
    Status: "Research Complete",
  });

  assert.deepEqual(
    [indoor.indoor, indoor.outdoor],
    [true, false],
  );
  assert.deepEqual(
    [outdoor.indoor, outdoor.outdoor],
    [false, true],
  );
  assert.deepEqual(
    [both.indoor, both.outdoor],
    [true, true],
  );
});

test("uses a neutral setting when the repeated source flag has no support", () => {
  const activity = mapActivityRecord({
    ID: "VK-2-4-0001",
    Type: "Activity",
    Section: "Vital Kids",
    Title: "Adventure Jar",
    Indoor: "false",
    Outdoor: "true",
    Weather: "Anywhere",
    Status: "Research Complete",
  });

  assert.equal(activity.indoor, false);
  assert.equal(activity.outdoor, false);
});

test("flags only evidence-backed environment/content inconsistencies", () => {
  const rows = [
    {
      ID: "INDOOR-CONFLICT",
      Type: "Activity",
      Section: "Vital Kids",
      Title: "Park mission",
      Instructions: "Follow the trail through the park.",
      Indoor: "true",
      Outdoor: "false",
      Status: "Research Complete",
    },
    {
      ID: "BOTH-REVIEW",
      Type: "Activity",
      Section: "Vital Kids",
      Title: "Garden search",
      Instructions: "Hide the object in the garden.",
      Indoor: "true",
      Outdoor: "true",
      Status: "Research Complete",
    },
    {
      ID: "BOTH-CONFLICT",
      Type: "Activity",
      Section: "Vital Kids",
      Title: "Outside mission",
      Instructions: "Head outside and complete the course in the park.",
      Indoor: "true",
      Outdoor: "true",
      Status: "Research Complete",
    },
    {
      ID: "CORRECTED-BOTH",
      Type: "Activity",
      Section: "Vital Kids",
      Title: "Rescue the Explorer",
      Instructions: "Hide a toy around the house, garden or park.",
      Indoor: "true",
      Outdoor: "true",
      Status: "Research Complete",
    },
  ];
  const activities = rows.map((row) => mapActivityRecord(row));
  const audit = auditActivityEnvironmentConsistency(rows, activities);

  assert.equal(audit.auditedActivities, 4);
  assert.deepEqual(
    audit.definiteContradictions.map(({ activityId }) => activityId),
    ["INDOOR-CONFLICT", "BOTH-CONFLICT"],
  );
  assert.deepEqual(
    audit.manualReview.map(({ activityId }) => activityId),
    ["BOTH-REVIEW"],
  );
  assert.match(audit.definiteContradictions[0].outdoorEvidence[0], /Park mission/);
});

test("creates stable relationship rows from ID-prefixed Resource Use entries", () => {
  const problems: ValidationDetail[] = [];
  const relationships = parseActivityRelationships({
    ID: "VK-2-4-0001",
    "Resource IDs": "R002; R003",
    "Resource Use": "R002: primary; R003: optional companion",
  }, (problem) => problems.push(problem));

  assert.deepEqual(relationships, [
    { activity_id: "VK-2-4-0001", resource_id: "R002", use_type: "primary", sort_order: 0 },
    { activity_id: "VK-2-4-0001", resource_id: "R003", use_type: "optional companion", sort_order: 1 },
  ]);
  assert.deepEqual(problems, []);
});

test("reports relationship count and ID-prefix mismatches", () => {
  const problems: ValidationDetail[] = [];
  parseActivityRelationships({
    ID: "A001",
    "Resource IDs": "R001; R002",
    "Resource Use": "R999: reuse",
  }, (problem) => problems.push(problem));

  assert.deepEqual(problems.map((problem) => problem.code), [
    "resource_use_count_mismatch",
    "resource_use_id_mismatch",
  ]);
});

test("maps supported resource metadata and uses a validated PDF page count", () => {
  const problems: ValidationDetail[] = [];
  const resource = mapResourceRecord({
    id: "R001",
    slug: "animal-tracks",
    title: "Animal Tracks",
    section: "Resources",
    resource_type: "guide",
    status: "complete",
    audience: ["families"],
    age_ranges: ["2-4"],
    formats: { pdf: "Animal_Tracks.pdf", markdown: "animal-tracks.md", metadata: "animal-tracks.json" },
    app_indexing: { searchable: true, downloadable: false, featured_terms: ["tracks"] },
  }, 8, (problem) => problems.push(problem));

  assert.equal(resource.id, "R001");
  assert.equal(resource.pdf_filename, "Animal_Tracks.pdf");
  assert.equal(resource.page_count, 8);
  assert.equal(resource.searchable, true);
  assert.equal(resource.downloadable, false);
  assert.deepEqual(resource.featured_terms, ["tracks"]);
  assert.deepEqual(resource.source_document, {
    id: "R001",
    slug: "animal-tracks",
    title: "Animal Tracks",
    section: "Resources",
    resource_type: "guide",
    status: "complete",
    audience: ["families"],
    age_ranges: ["2-4"],
    formats: { pdf: "Animal_Tracks.pdf", markdown: "animal-tracks.md", metadata: "animal-tracks.json" },
    app_indexing: { searchable: true, downloadable: false, featured_terms: ["tracks"] },
  });
  assert.deepEqual(problems, []);
});

test("source_document retains bespoke nested resource data without flattening", () => {
  const raw = {
    id: "R088",
    slug: "bespoke-resource",
    title: "Bespoke Resource",
    section: "Resources",
    resource_type: "printable",
    status: "complete",
    formats: { pdf: "Bespoke.pdf" },
    bespoke_sections: [{ heading: "One", items: ["a", "b"] }],
    scoring_matrix: { low: 1, high: 5 },
  };
  const mapped = mapResourceRecord(raw, 4);

  assert.deepEqual(mapped.source_document, raw);
  assert.notEqual(mapped.source_document, raw);
});

test("database verification comparison passes only when every expected source key exists", () => {
  const expected = {
    activityIds: ["A001", "A002"],
    resourceIds: ["R001", "R002"],
    relationshipKeys: ["A001::R001", "A002::R002"],
  };
  const passing = compareSourceSets(expected, {
    activityIds: ["A002", "A001", "UNRELATED"],
    resourceIds: ["R001", "R002"],
    relationshipKeys: ["A001::R001", "A002::R002", "STALE::R999"],
  });
  assert.equal(passing.status, "PASS");
  assert.deepEqual(passing.verified, { activities: 2, resources: 2, relationships: 2 });

  const failing = compareSourceSets(expected, {
    activityIds: ["A001"],
    resourceIds: ["R002"],
    relationshipKeys: ["A001::R001"],
  });
  assert.equal(failing.status, "FAIL");
  assert.deepEqual(failing.missing, {
    activityIds: ["A002"],
    resourceIds: ["R001"],
    relationshipKeys: ["A002::R002"],
  });
  assert.match(formatVerificationFailure(failing), /missing activity IDs \(1\): A002/);
  assert.match(formatVerificationFailure(failing), /missing relationship keys \(1\): A002::R002/);
});
