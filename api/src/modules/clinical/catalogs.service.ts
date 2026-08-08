import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  searchCie(q?: string, take = 20) {
    const query = q?.trim();
    return this.prisma.cieCode.findMany({
      where: {
        isActive: true,
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: { code: 'asc' },
    });
  }

  searchCups(q?: string, take = 20) {
    const query = q?.trim();
    return this.prisma.cupsCode.findMany({
      where: {
        isActive: true,
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: { code: 'asc' },
    });
  }
}
