/**
 * Limpia documentos repetidos por consultorio:
 * 1) Completa títulos truncados con la sección de la descripción.
 * 2) Elimina requisitos vacíos que duplican el mismo título (tras normalizar).
 * 3) Elimina archivos con el mismo checksum en otro requisito del mismo consultorio
 *    (deja la copia en el requisito “ganador”).
 * 4) Dentro de un mismo requisito, deja una sola versión por checksum.
 *
 * Uso:
 *   cd api && npx ts-node scripts/dedupe-clinic-documents.ts
 *   DRY_RUN=1 npx ts-node scripts/dedupe-clinic-documents.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function normTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function enrichedTitle(title: string, description: string | null) {
  const t = title.trim();
  const desc = (description || '').trim();
  const section = /^Sección:\s*(.+)$/i.exec(desc)?.[1]?.trim();
  if (section && t.length <= 24 && !t.toLowerCase().includes(section.toLowerCase())) {
    return `${t} — ${section}`.slice(0, 255);
  }
  return t;
}

async function main() {
  console.log(DRY ? '=== DRY RUN (sin borrar) ===' : '=== APLICANDO LIMPIEZA ===');

  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  let renamed = 0;
  let deletedReqs = 0;
  let deletedFiles = 0;

  for (const clinic of clinics) {
    const reqs = await prisma.documentRequirement.findMany({
      where: { clinicId: clinic.id },
      include: {
        files: {
          select: {
            id: true,
            checksum: true,
            version: true,
            status: true,
            createdAt: true,
            originalName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!reqs.length) {
      console.log(`\n[${clinic.name}] sin requisitos`);
      continue;
    }

    console.log(`\n[${clinic.name}] ${reqs.length} requisitos`);

    // 1) Enriquecer títulos truncados
    for (const req of reqs) {
      const next = enrichedTitle(req.title, req.description);
      if (next !== req.title) {
        console.log(`  rename: ${req.code}  "${req.title}" → "${next}"`);
        renamed += 1;
        if (!DRY) {
          await prisma.documentRequirement.update({
            where: { id: req.id },
            data: { title: next },
          });
        }
        req.title = next;
      }
    }

    // 2) Dentro del mismo requisito: una sola versión por checksum
    for (const req of reqs) {
      const byChecksum = new Map<string, typeof req.files>();
      for (const f of req.files) {
        const key = (f.checksum || '').trim() || `noid:${f.originalName}:${f.version}`;
        const list = byChecksum.get(key) || [];
        list.push(f);
        byChecksum.set(key, list);
      }
      for (const [key, list] of byChecksum) {
        if (list.length < 2) continue;
        if (key.startsWith('noid:')) continue;
        // Preferir SIGNED, luego versión más alta
        const ranked = [...list].sort((a, b) => {
          const score = (x: (typeof list)[0]) =>
            (x.status === 'SIGNED' ? 1000 : x.status === 'PARTIALLY_SIGNED' ? 500 : 0) +
            x.version;
          return score(b) - score(a);
        });
        const [, ...losers] = ranked;
        for (const loser of losers) {
          console.log(
            `  file-dup in ${req.code}: drop v${loser.version} (${loser.originalName})`,
          );
          deletedFiles += 1;
          if (!DRY) {
            await prisma.documentFile.delete({ where: { id: loser.id } });
          }
          req.files = req.files.filter((f) => f.id !== loser.id);
        }
      }
    }

    // 3) Archivos idénticos (checksum) en dos requisitos del mismo consultorio
    type Owner = {
      reqId: string;
      code: string;
      title: string;
      fileCount: number;
      enabled: boolean;
    };
    const checksumFiles = new Map<
      string,
      Array<{ fileId: string; originalName: string; owner: Owner }>
    >();

    for (const req of reqs) {
      const owner: Owner = {
        reqId: req.id,
        code: req.code,
        title: req.title,
        fileCount: req.files.length,
        enabled: req.isEnabled,
      };
      for (const f of req.files) {
        const sum = (f.checksum || '').trim();
        if (!sum) continue;
        const list = checksumFiles.get(sum) || [];
        list.push({ fileId: f.id, originalName: f.originalName, owner });
        checksumFiles.set(sum, list);
      }
    }

    const scoreOwner = (o: Owner, originalName: string) => {
      const name = originalName.toLowerCase();
      const titleBits = o.title
        .toLowerCase()
        .split(/[^a-záéíóúñ0-9]+/i)
        .filter((w) => w.length >= 4);
      const codeBits = o.code
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
      let score = 0;
      for (const w of titleBits) if (name.includes(w)) score += 40;
      for (const w of codeBits) if (name.includes(w)) score += 25;
      if (o.enabled) score += 5;
      // Preferir el requisito “más específico” (menos archivos = menos basurero)
      score += Math.max(0, 20 - o.fileCount);
      // En empate habilitación vs SST, preferir el código de estándar (no SST_)
      if (!o.code.startsWith('SST_')) score += 3;
      return score;
    };

    for (const [, entries] of checksumFiles) {
      const reqIds = new Set(entries.map((e) => e.owner.reqId));
      if (reqIds.size < 2) continue;
      const sampleName = entries[0].originalName;
      const best = [...entries].sort(
        (a, b) =>
          scoreOwner(b.owner, sampleName) - scoreOwner(a.owner, sampleName),
      )[0];
      for (const entry of entries) {
        if (entry.owner.reqId === best.owner.reqId) continue;
        console.log(
          `  cross-dup: ${entry.owner.code} ← ${entry.originalName} (keep in ${best.owner.code})`,
        );
        deletedFiles += 1;
        if (!DRY) {
          await prisma.documentFile.delete({ where: { id: entry.fileId } });
        }
        const req = reqs.find((r) => r.id === entry.owner.reqId);
        if (req) req.files = req.files.filter((f) => f.id !== entry.fileId);
      }
    }

    // 4) Requisitos vacíos duplicados por título normalizado
    const byTitle = new Map<string, typeof reqs>();
    for (const req of reqs) {
      const key = normTitle(req.title);
      const list = byTitle.get(key) || [];
      list.push(req);
      byTitle.set(key, list);
    }

    for (const [title, group] of byTitle) {
      if (group.length < 2) continue;
      const withFiles = group.filter((r) => r.files.length > 0);
      const empty = group.filter((r) => r.files.length === 0);

      if (withFiles.length >= 1 && empty.length >= 1) {
        for (const loser of empty) {
          console.log(
            `  drop empty dup "${title}": ${loser.code} (keep ${withFiles.map((r) => r.code).join(',')})`,
          );
          deletedReqs += 1;
          if (!DRY) {
            await prisma.documentRequirement.delete({ where: { id: loser.id } });
          }
        }
        continue;
      }

      // Todos vacíos: dejar uno
      if (withFiles.length === 0 && empty.length > 1) {
        const ranked = [...empty].sort((a, b) => {
          const score = (r: (typeof empty)[0]) =>
            (r.isEnabled ? 10 : 0) + (r.isMandatory ? 2 : 0);
          return score(b) - score(a);
        });
        const [, ...losers] = ranked;
        for (const loser of losers) {
          console.log(`  drop empty-only dup "${title}": ${loser.code}`);
          deletedReqs += 1;
          if (!DRY) {
            await prisma.documentRequirement.delete({ where: { id: loser.id } });
          }
        }
      }
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Títulos renombrados: ${renamed}`);
  console.log(`Archivos eliminados: ${deletedFiles}`);
  console.log(`Requisitos eliminados: ${deletedReqs}`);
  if (DRY) console.log('Nada se guardó (DRY_RUN=1). Ejecute sin DRY_RUN para aplicar.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
