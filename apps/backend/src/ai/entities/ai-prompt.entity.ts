import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_prompts')
export class AiPromptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable identifier used by AiService to look up this prompt (e.g. 'enrich_profile'). */
  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'text' })
  systemPrompt: string;

  @Column({ type: 'varchar', default: 'claude-sonnet-4.6' })
  model: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isCustomized: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
