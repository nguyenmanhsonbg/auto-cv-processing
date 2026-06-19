import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'yaml';
import { CategoryEntity } from './entities/category.entity';
import { SubCategoryEntity } from './entities/sub-category.entity';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(CategoryEntity)
    private catRepo: Repository<CategoryEntity>,
    @InjectRepository(SubCategoryEntity)
    private subRepo: Repository<SubCategoryEntity>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  // ── Categories ──

  async findAllCategories(position?: string) {
    const all = await this.catRepo.find({ order: { orderIndex: 'ASC', name: 'ASC' } });
    if (!position) return all;
    // null/empty positions = default (shown for every position); otherwise must include the given position
    return all.filter((c) => !c.positions?.length || c.positions.includes(position));
  }

  async findCategory(id: string) {
    const c = await this.catRepo.findOne({ where: { id } });
    if (!c) throw new BadRequestException('Category not found');
    return c;
  }

  async createCategory(data: { name: string; displayName: string; description?: string; orderIndex?: number; positions?: string[] | null }) {
    const exists = await this.catRepo.findOne({ where: { name: data.name } });
    if (exists) throw new BadRequestException('Category with this name already exists');
    return this.catRepo.save(this.catRepo.create(data));
  }

  async updateCategory(id: string, data: { name?: string; displayName?: string; description?: string; orderIndex?: number; positions?: string[] | null }) {
    const c = await this.findCategory(id);
    Object.assign(c, data);
    c.isCustomized = true;
    return this.catRepo.save(c);
  }

  async removeCategory(id: string) {
    const c = await this.findCategory(id);
    await this.subRepo.delete({ categoryId: id });
    await this.catRepo.remove(c);
    return { deleted: true };
  }

  // ── SubCategories ──

  findAllSubCategories(categoryId?: string) {
    const where = categoryId ? { categoryId } : {};
    return this.subRepo.find({ where, order: { orderIndex: 'ASC', name: 'ASC' } });
  }

  async findSubCategory(id: string) {
    const s = await this.subRepo.findOne({ where: { id } });
    if (!s) throw new BadRequestException('SubCategory not found');
    return s;
  }

  async createSubCategory(data: { categoryId: string; name: string; orderIndex?: number; competencyType?: string }) {
    await this.findCategory(data.categoryId); // validates parent exists
    return this.subRepo.save(this.subRepo.create(data));
  }

  async updateSubCategory(id: string, data: { name?: string; orderIndex?: number; categoryId?: string; competencyType?: string }) {
    const s = await this.findSubCategory(id);
    Object.assign(s, data);
    s.isCustomized = true;
    return this.subRepo.save(s);
  }

  async removeSubCategory(id: string) {
    const s = await this.findSubCategory(id);
    await this.subRepo.remove(s);
    return { deleted: true };
  }

  async resetCategory(id: string) {
    const cat = await this.findCategory(id);
    const defaults: Array<{ name: string; displayName: string; orderIndex: number; positions?: string[]; subs: string[] }> =
      parse(readFileSync(join(__dirname, '../assets/seed/categories.yaml'), 'utf8'));
    const seedEntry = defaults.find((d) => d.name === cat.name);
    if (seedEntry) {
      cat.displayName = seedEntry.displayName;
      cat.orderIndex = seedEntry.orderIndex;
      cat.positions = seedEntry.positions ?? null;
    }
    cat.isCustomized = false;
    return this.catRepo.save(cat);
  }

  async resetSubCategory(id: string) {
    const sub = await this.findSubCategory(id);
    type SubSeed = string | { name: string; competencyType?: string };
    const defaults: Array<{ name: string; displayName: string; orderIndex: number; subs: SubSeed[] }> =
      parse(readFileSync(join(__dirname, '../assets/seed/categories.yaml'), 'utf8'));
    const parentCat = await this.catRepo.findOne({ where: { id: sub.categoryId } });
    if (parentCat) {
      const catSeed = defaults.find((d) => d.name === parentCat.name);
      if (catSeed) {
        const subIdx = catSeed.subs.findIndex((s) => (typeof s === 'string' ? s : s.name) === sub.name);
        if (subIdx >= 0) {
          sub.orderIndex = subIdx;
          const subSeed = catSeed.subs[subIdx];
          if (typeof subSeed !== 'string' && subSeed.competencyType) {
            sub.competencyType = subSeed.competencyType;
          }
        }
      }
    }
    sub.isCustomized = false;
    return this.subRepo.save(sub);
  }

  // ── Aggregate helpers ──

  /**
   * Returns ordered categories (excluding the given names) each paired with
   * their ordered subcategories. Used by other modules to build dynamic
   * subcategory lists without hardcoding category codes.
   */
  async findCategoriesWithSubcategories(
    excludeNames: string[] = [],
  ): Promise<{ category: CategoryEntity; subs: SubCategoryEntity[] }[]> {
    const cats = await this.catRepo.find({ order: { orderIndex: 'ASC', name: 'ASC' } });
    const filtered = excludeNames.length
      ? cats.filter((c) => !excludeNames.includes(c.name))
      : cats;
    return Promise.all(
      filtered.map(async (category) => ({
        category,
        subs: await this.subRepo.find({
          where: { categoryId: category.id },
          order: { orderIndex: 'ASC', name: 'ASC' },
        }),
      })),
    );
  }

  // ── Seed ──

  async seed() {
    type SubSeed = string | { name: string; competencyType?: string };
    const defaultData: Array<{ name: string; displayName: string; orderIndex: number; positions?: string[]; subs: SubSeed[] }> =
      parse(readFileSync(join(__dirname, '../assets/seed/categories.yaml'), 'utf8'));

    // Batch-load all existing rows
    const allCats = await this.catRepo.find();
    const catByName = new Map(allCats.map((c) => [c.name, c]));
    const allSubs = await this.subRepo.find();
    const subByKey = new Map(allSubs.map((s) => [`${s.categoryId}::${s.name}`, s]));

    let categoriesCreated = 0;
    let subsCreated = 0;

    // First pass: upsert categories (need IDs for subcategories)
    const catsToSave: CategoryEntity[] = [];
    for (const catData of defaultData) {
      const cat = catByName.get(catData.name);
      if (!cat) {
        catsToSave.push(this.catRepo.create({
          name: catData.name,
          displayName: catData.displayName,
          orderIndex: catData.orderIndex,
          positions: catData.positions ?? null,
        }));
        categoriesCreated++;
      } else if (!cat.isCustomized) {
        cat.displayName = catData.displayName;
        cat.orderIndex = catData.orderIndex;
        cat.positions = catData.positions ?? null;
        catsToSave.push(cat);
      }
    }
    if (catsToSave.length) {
      const saved = await this.catRepo.save(catsToSave);
      // Update the map with newly created categories (now have IDs)
      for (const c of saved) catByName.set(c.name, c);
    }

    // Second pass: upsert subcategories
    const subsToSave: SubCategoryEntity[] = [];
    for (const catData of defaultData) {
      const cat = catByName.get(catData.name)!;
      for (let i = 0; i < catData.subs.length; i++) {
        const subSeed = catData.subs[i];
        const subName = typeof subSeed === 'string' ? subSeed : subSeed.name;
        const competencyType = typeof subSeed === 'string' ? undefined : subSeed.competencyType;
        const existing = subByKey.get(`${cat.id}::${subName}`);
        if (!existing) {
          subsToSave.push(this.subRepo.create({ categoryId: cat.id, name: subName, orderIndex: i, competencyType }));
          subsCreated++;
        } else if (!existing.isCustomized) {
          existing.orderIndex = i;
          if (competencyType !== undefined) existing.competencyType = competencyType;
          subsToSave.push(existing);
        }
      }
    }
    if (subsToSave.length) await this.subRepo.save(subsToSave);

    return { categoriesCreated, subsCreated };
  }
}
