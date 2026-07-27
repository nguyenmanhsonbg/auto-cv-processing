import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('freelancer_identifier_counters')
export class FreelancerIdentifierCounterEntity {
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({ name: 'last_issued_number', type: 'integer' })
  lastIssuedNumber: number;
}
