import { JobDescriptionEntity } from './entities/job-description.entity';

export interface JobDescriptionSnapshot extends Record<string, unknown> {
  schemaVersion: 2;
  snapshottedAt: string;
  jobDescription: {
    id: string;
    title: string;
    positionId: string | null;
    levelId: string | null;
    description: string;
    overview: string | null;
    responsibilities: string | null;
    summary: string;
    requirements: string;
    benefits: Record<string, unknown> | null;
    salary: string | null;
    annualLeaveDays: string | null;
    department: string | null;
    applicationDeadline: string | null;
    status: string;
    createdById: string;
    createdAt: string | null;
    updatedAt: string | null;
  };
  position: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  level: {
    id: string;
    name: string;
    displayName: string;
    orderIndex: number;
  } | null;
  createdBy: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
}

export function buildJobDescriptionSnapshot(jobDescription: JobDescriptionEntity): JobDescriptionSnapshot {
  return {
    schemaVersion: 2,
    snapshottedAt: new Date().toISOString(),
    jobDescription: {
      id: jobDescription.id,
      title: jobDescription.title,
      positionId: jobDescription.positionId,
      levelId: jobDescription.levelId,
      description: jobDescription.description,
      overview: jobDescription.overview,
      responsibilities: jobDescription.responsibilities,
      summary: summarizeJobDescription(jobDescription),
      requirements: jobDescription.requirements,
      benefits: jobDescription.benefits,
      salary: jobDescription.salary,
      annualLeaveDays: jobDescription.annualLeaveDays,
      department: jobDescription.department,
      applicationDeadline: jobDescription.applicationDeadline,
      status: jobDescription.status,
      createdById: jobDescription.createdById,
      createdAt: jobDescription.createdAt?.toISOString() ?? null,
      updatedAt: jobDescription.updatedAt?.toISOString() ?? null,
    },
    position: jobDescription.position
      ? {
          id: jobDescription.position.id,
          name: jobDescription.position.name,
          description: jobDescription.position.description,
        }
      : null,
    level: jobDescription.level
      ? {
          id: jobDescription.level.id,
          name: jobDescription.level.name,
          displayName: jobDescription.level.displayName,
          orderIndex: jobDescription.level.orderIndex,
        }
      : null,
    createdBy: jobDescription.createdBy
      ? {
          id: jobDescription.createdBy.id,
          email: jobDescription.createdBy.email,
          name: jobDescription.createdBy.name,
          role: jobDescription.createdBy.role,
        }
      : null,
  };
}

function summarizeJobDescription(jobDescription: JobDescriptionEntity) {
  const summary = jobDescription.summary?.trim();
  if (summary) return summary;

  const normalized = (jobDescription.description || jobDescription.title).trim();
  return normalized.length > 500 ? normalized.slice(0, 500).trim() : normalized;
}
