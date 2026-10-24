import { Controller, Get, Injectable, Logger, Module, NotFoundException, OnModuleInit, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth.decorators.js';
import type { Env } from '../config/env.js';
import { LEGAL_DOCS, type LegalSlug } from './legal.texts.js';

@ApiTags('legal')
@Controller('legal')
export class LegalController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Hukuki metinlerin listesi (başlık, sürüm)' })
  list() {
    return Object.values(LEGAL_DOCS).map(({ body: _b, ...meta }) => meta);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Hukuki metin: kvkk · kosullar · ticari-ileti (markdown)' })
  get(@Param('slug') slug: string) {
    const doc = LEGAL_DOCS[slug as LegalSlug];
    if (!doc) throw new NotFoundException('Metin bulunamadı');
    return doc;
  }
}

/** Rıza kayıtlarındaki sürüm ile yayımlanan metin sürümü ayrışırsa açılışta uyarır. */
@Injectable()
class LegalVersionCheck implements OnModuleInit {
  private readonly logger = new Logger('Legal');
  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit() {
    const pairs: [string, string, string][] = [
      ['KVKK_CLARIFICATION_VERSION', this.config.get('KVKK_CLARIFICATION_VERSION', { infer: true }), LEGAL_DOCS.kvkk.version],
      ['TERMS_VERSION', this.config.get('TERMS_VERSION', { infer: true }), LEGAL_DOCS.kosullar.version],
    ];
    for (const [key, env, doc] of pairs) {
      if (env !== doc) this.logger.warn(`${key}=${env} ama yayımlanan metin sürümü ${doc}; rıza kayıtları yanlış sürümle tutulur`);
    }
    const drafts = Object.values(LEGAL_DOCS).filter((d) => d.draft);
    if (drafts.length > 0 && this.config.get('NODE_ENV', { infer: true }) === 'production') {
      this.logger.warn(`Taslak hukuki metinler yayında: ${drafts.map((d) => d.slug).join(', ')}`);
    }
  }
}

@Module({
  controllers: [LegalController],
  providers: [LegalVersionCheck],
})
export class LegalModule {}
