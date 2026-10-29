import { Prisma } from '@prisma/client';

export const leaveRequestSelect = {
  id: true,
  startDate: true,
  endDate: true,
  days: true,
  reason: true,
  status: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeNumber: true,
      managerId: true,
      user: { select: { id: true, name: true } },
    },
  },
  approver: { select: { id: true, name: true } },
} satisfies Prisma.LeaveRequestSelect;

export type LeaveRequestView = Prisma.LeaveRequestGetPayload<{
  select: typeof leaveRequestSelect;
}>;
