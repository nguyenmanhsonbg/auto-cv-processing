// One-off seed: for each target JD, ensure a QuestionSet linked via jobDescriptionId
// with 5 QuestionSetItems referencing any 5 active questions. Idempotent.
// Run with: pnpm --filter @interview-assistant/backend seed:attach-qsets

import 'reflect-metadata';
import dataSource from '../config/typeorm.config';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { QuestionEntity } from '../questions/entities/question.entity';
import { QuestionSetEntity } from '../questions/entities/question-set.entity';
import { QuestionSetItemEntity } from '../questions/entities/question-set-item.entity';

const TARGET_JD_TITLES = [
  'Cộng tác viên Tuyển dụng',
  'ReactJS',
  'Tester',
];

const ITEMS_PER_SET = 5;

async function waitForDb(maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await dataSource.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function findOrphanedJd(titlePrefix: string) {
  return dataSource
    .getRepository(JobDescriptionEntity)
    .createQueryBuilder('jd')
    .leftJoin('jd.postings', 'p')
    .leftJoin('jd.versions', 'v')
    .where('LOWER(jd.title) LIKE LOWER(:prefix)', { prefix: `${titlePrefix}%` })
    .andWhere('p.id IS NULL')
    .andWhere('v.id IS NULL')
    .orderBy('jd.createdAt', 'DESC')
    .getMany();
}

async function findJobDescriptionByTitle(title: string): Promise<JobDescriptionEntity | null> {
  return dataSource
    .getRepository(JobDescriptionEntity)
    .createQueryBuilder('jd')
    .where('LOWER(jd.title) LIKE LOWER(:title)', { title: `%${title}%` })
    .orderBy('jd.createdAt', 'DESC')
    .getOne();
}

async function hasQuestionSet(jdId: string): Promise<boolean> {
  const count = await dataSource
    .getRepository(QuestionSetEntity)
    .createQueryBuilder('qs')
    .where('qs.jobDescriptionId = :id', { id: jdId })
    .getCount();
  return count > 0;
}

async function pickAnyQuestions(limit: number): Promise<QuestionEntity[]> {
  const repo = dataSource.getRepository(QuestionEntity);
  return repo
    .createQueryBuilder('q')
    .where('q.isActive = :active', { active: true })
    .orderBy('q.createdAt', 'ASC')
    .limit(limit)
    .getMany();
}

async function getAnyAdminUserId(): Promise<string> {
  const row = await dataSource.query(
    `SELECT id FROM users WHERE role = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1`,
  );
  if (!row.length) {
    throw new Error('No ADMIN user found — cannot create QuestionSet without createdById.');
  }
  return row[0].id;
}

async function main() {
  await dataSource.initialize();
  await waitForDb();
  console.log('DB ready.');

  // Discover JDs by title pattern, picking the most recent for ambiguous names.
  const jds: JobDescriptionEntity[] = [];
  for (const title of TARGET_JD_TITLES) {
    // First try exact-ish match
    const exact = await dataSource
      .getRepository(JobDescriptionEntity)
      .createQueryBuilder('jd')
      .where('LOWER(jd.title) = LOWER(:title)', { title })
      .orderBy('jd.createdAt', 'DESC')
      .getOne();
    if (exact) {
      jds.push(exact);
      continue;
    }
    // Fallback: prefix LIKE
    const list = await findOrphanedJd(title);
    if (list.length === 0) {
      const fuzzy = await findJobDescriptionByTitle(title);
      if (fuzzy) jds.push(fuzzy);
    } else {
      jds.push(list[0]);
    }
  }

  if (jds.length === 0) {
    console.log('No target JDs found. Aborting.');
    return;
  }

  console.log(`Found ${jds.length} JD(s) to inspect:`);
  for (const jd of jds) {
    const linked = await hasQuestionSet(jd.id);
    console.log(` - ${jd.title} [${jd.id}] -> has QuestionSet: ${linked}`);
  }

  const questions = await pickAnyQuestions(ITEMS_PER_SET);
  if (questions.length < ITEMS_PER_SET) {
    throw new Error(
      `Need at least ${ITEMS_PER_SET} active questions, found only ${questions.length}.`,
    );
  }
  const createdById = await getAnyAdminUserId();

  let createdSets = 0;
  let skippedSets = 0;
  for (const jd of jds) {
    if (await hasQuestionSet(jd.id)) {
      skippedSets++;
      console.log(`SKIP: ${jd.title} already has a QuestionSet.`);
      continue;
    }

    const set = dataSource.getRepository(QuestionSetEntity).create({
      jobDescriptionId: jd.id,
      name: `Auto-set for ${jd.title}`,
      status: 'DRAFT',
      createdById,
    });
    const saved = await dataSource.getRepository(QuestionSetEntity).save(set);

    const items = questions.map((q, idx) =>
      dataSource.getRepository(QuestionSetItemEntity).create({
        questionSetId: saved.id,
        questionId: q.id,
        questionTextSnapshot: q.text,
        questionType: q.type,
        orderIndex: idx,
        required: true,
      }),
    );
    await dataSource.getRepository(QuestionSetItemEntity).save(items);
    createdSets++;
    console.log(`CREATED QuestionSet ${saved.id} for ${jd.title} with ${items.length} items.`);
  }

  console.log(`Done. created=${createdSets}, skipped=${skippedSets}.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });