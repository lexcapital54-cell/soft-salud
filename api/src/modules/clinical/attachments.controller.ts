import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentMetaDto } from './dto/attachment.dto';

@Controller('clinical-attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR,
  )
  list(
    @Req() req: { user: User },
    @Query('encounterId') encounterId: string,
  ) {
    return this.attachmentsService.listByEncounter(req.user, encounterId);
  }

  @Get(':id/download')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR,
  )
  async download(@Req() req: { user: User }, @Param('id') id: string) {
    const { file } = await this.attachmentsService.download(req.user, id);
    return file;
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  upload(
    @Req() req: { user: User },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
  ) {
    const meta: UploadAttachmentMetaDto = {
      encounterId: body.encounterId,
      clinicalRecordId: body.clinicalRecordId || undefined,
      label: body.label || file?.originalname || 'adjunto',
      category: (body.category as UploadAttachmentMetaDto['category']) || undefined,
      caption: body.caption || undefined,
      notes: body.notes || undefined,
    };
    return this.attachmentsService.upload(req.user, meta, file);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  remove(@Req() req: { user: User }, @Param('id') id: string) {
    return this.attachmentsService.remove(req.user, id);
  }
}
