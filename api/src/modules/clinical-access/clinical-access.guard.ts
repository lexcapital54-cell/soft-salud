import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { User } from '../../users/user.entity';
import { ClinicalAccessService } from './clinical-access.service';

/**
 * ABAC: el profesional con plan HOURLY_RENTAL solo accede a HCE
 * si tiene una reserva activa (más margen de gracia).
 * Mensualidad fija y otros roles clínicos no se restringen aquí.
 *
 * Rutas /me/* (tarjeta profesional, RIPS, REPS) quedan fuera: son
 * configuración de sesión, no consulta de historias.
 */
@Injectable()
export class ClinicalAccessGuard implements CanActivate {
  constructor(private readonly access: ClinicalAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: User;
      path?: string;
      url?: string;
      originalUrl?: string;
    }>();
    const path = String(req.originalUrl || req.url || req.path || '');
    if (/(^|\/)me(\/|\?|$)/.test(path)) {
      return true;
    }
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('No autenticado');
    }
    const result = await this.access.checkAccess(user);
    if (result.hasAccess) return true;
    throw new ForbiddenException({
      message: result.message,
      reason: result.reason,
      membershipType: result.membershipType,
      gracePeriodMinutes: result.gracePeriodMinutes,
      accessUntil: result.accessUntil ?? null,
      activeBooking: result.activeBooking ?? null,
    });
  }
}
