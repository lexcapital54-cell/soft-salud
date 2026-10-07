import { UserRole } from '@prisma/client';

/** El equipo de la plataforma aparece como «HabiliSalud»; el personal del consultorio, con su nombre. */
export function uploaderLabel(user: { fullName: string | null; role: UserRole | string } | null | undefined): string | null {
  if (!user) return null;
  if (user.role === UserRole.SUPER_ADMIN) return 'HabiliSalud';
  return user.fullName || null;
}
