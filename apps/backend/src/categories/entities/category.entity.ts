import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('categories')
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  displayName: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ default: 0 })
  orderIndex: number;

  @Column({ default: false })
  isCustomized: boolean;

  // null = default (shown for all positions); non-empty array = position-specific
  @Column({ type: 'simple-json', nullable: true })
  positions: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
