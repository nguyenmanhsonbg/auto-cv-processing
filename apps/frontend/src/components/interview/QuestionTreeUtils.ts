import { useCallback, useEffect, useRef, useState } from 'react';

export interface QuestionTreeCategory<T> {
  name: string;
  subcategories: Map<string, T[]>;
  allQuestions: T[];
}

interface BuildQuestionTreeOptions<T> {
  categoryOrder?: Map<string, string[]>;
  filter?: (question: T) => boolean;
  getCategory: (question: T) => string | undefined;
  getSubcategory: (question: T) => string | undefined;
}

function compareByOrder(left: string, right: string, order: readonly string[]) {
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);

  if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
  return (leftIndex === -1 ? Infinity : leftIndex) - (rightIndex === -1 ? Infinity : rightIndex);
}

function sortSubcategories<T>(
  category: QuestionTreeCategory<T>,
  order: readonly string[],
): QuestionTreeCategory<T> {
  return {
    ...category,
    subcategories: new Map(
      Array.from(category.subcategories.entries()).sort(([left], [right]) =>
        compareByOrder(left, right, order),
      ),
    ),
  };
}

export function buildQuestionTree<T>(
  questions: readonly T[],
  {
    categoryOrder,
    filter,
    getCategory,
    getSubcategory,
  }: BuildQuestionTreeOptions<T>,
): Map<string, QuestionTreeCategory<T>> {
  const categoryMap = new Map<string, QuestionTreeCategory<T>>();
  const filteredQuestions = filter ? questions.filter(filter) : questions;

  filteredQuestions.forEach((question) => {
    const categoryName = getCategory(question) || 'Uncategorized';
    const subcategoryName = getSubcategory(question) || 'General';
    const category = categoryMap.get(categoryName) ?? {
      name: categoryName,
      subcategories: new Map<string, T[]>(),
      allQuestions: [],
    };

    category.allQuestions.push(question);
    const subcategory = category.subcategories.get(subcategoryName) ?? [];
    subcategory.push(question);
    category.subcategories.set(subcategoryName, subcategory);
    categoryMap.set(categoryName, category);
  });

  if (!categoryOrder || categoryOrder.size === 0) return categoryMap;

  const categoryOrderKeys = Array.from(categoryOrder.keys());
  return new Map(
    Array.from(categoryMap.entries())
      .sort(([left], [right]) => compareByOrder(left, right, categoryOrderKeys))
      .map(([categoryName, category]) => [
        categoryName,
        sortSubcategories(category, categoryOrder.get(categoryName) ?? []),
      ]),
  );
}

function getExpandedKeys<T>(tree: Map<string, QuestionTreeCategory<T>>) {
  const categories = new Set(['__all__']);
  const subcategories = new Set(['__all__']);

  tree.forEach((category, categoryName) => {
    categories.add(categoryName);
    category.subcategories.forEach((_, subcategoryName) => {
      subcategories.add(`${categoryName}::${subcategoryName}`);
    });
  });

  return { categories, subcategories };
}

interface UseQuestionTreeExpansionOptions {
  resetOnTreeChange?: boolean;
}

export function useQuestionTreeExpansion<T>(
  tree: Map<string, QuestionTreeCategory<T>>,
  { resetOnTreeChange = false }: UseQuestionTreeExpansionOptions = {},
) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['__all__']),
  );
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set(['__all__']));
  const initialized = useRef(false);

  useEffect(() => {
    if (tree.size === 0 || (!resetOnTreeChange && initialized.current)) return;
    initialized.current = true;
    const { categories, subcategories } = getExpandedKeys(tree);
    setExpandedCategories(categories);
    setExpandedSubs(subcategories);
  }, [resetOnTreeChange, tree]);

  const toggleCategory = useCallback((categoryName: string) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(categoryName)) next.delete(categoryName);
      else next.add(categoryName);
      return next;
    });
  }, []);

  const toggleSubcategory = useCallback((subcategoryName: string) => {
    setExpandedSubs((previous) => {
      const next = new Set(previous);
      if (next.has(subcategoryName)) next.delete(subcategoryName);
      else next.add(subcategoryName);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const { categories, subcategories } = getExpandedKeys(tree);
    setExpandedCategories(categories);
    setExpandedSubs(subcategories);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedCategories(new Set());
    setExpandedSubs(new Set());
  }, []);

  const isFullyExpanded = Array.from(tree.entries()).every(([categoryName, category]) =>
    expandedCategories.has(categoryName) &&
    Array.from(category.subcategories.keys()).every((subcategoryName) =>
      expandedSubs.has(`${categoryName}::${subcategoryName}`),
    ),
  );
  const isFullyCollapsed = Array.from(tree.entries()).every(([categoryName, category]) =>
    !expandedCategories.has(categoryName) &&
    Array.from(category.subcategories.keys()).every((subcategoryName) =>
      !expandedSubs.has(`${categoryName}::${subcategoryName}`),
    ),
  );

  return {
    collapseAll,
    expandAll,
    expandedCategories,
    expandedSubs,
    isFullyCollapsed,
    isFullyExpanded,
    setExpandedCategories,
    setExpandedSubs,
    toggleCategory,
    toggleSubcategory,
  };
}
