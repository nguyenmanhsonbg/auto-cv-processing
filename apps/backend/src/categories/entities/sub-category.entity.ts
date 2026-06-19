import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('sub_categories')
export class SubCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @Column()
  name: string;

  @Column({ default: 0 })
  orderIndex: number;

  @Column({ nullable: true })
  competencyType: string; // 'KNOWLEDGE' | 'SKILL' | 'ADDITIONAL'

  @Column({ default: false })
  isCustomized: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
