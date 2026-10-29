import { Prisma } from '@prisma/client';

export const employeeSelect = {
  id: true,
  employeeNumber: true,
  position: true,
  department: true,
  joinDate: true,
  managerId: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: { id: true, name: true, email: true, role: true, isActive: true },
  },
  manager: {
    select: {
      id: true,
      employeeNumber: true,
      position: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.EmployeeSelect;

export type EmployeeView = Prisma.EmployeeGetPayload<{
  select: typeof employeeSelect;
}>;
