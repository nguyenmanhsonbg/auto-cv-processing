import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle } from 'lucide-react';

export interface ChoiceAnswerOption {
  id: string;
  text: string;
}

export function ChoiceAnswerReview({
  candidateAnswer,
  options,
  correctAnswers,
}: Readonly<{
  candidateAnswer: string;
  options: ChoiceAnswerOption[];
  correctAnswers: string[];
}>) {
  const selectedIds = new Set(candidateAnswer.split(','));

  return (
    <div className="mt-1 space-y-1">
      {options.map((opt) => {
        const isSelected = selectedIds.has(opt.id);
        const isCorrect = correctAnswers.includes(opt.id);

        return (
          <div
            key={opt.id}
            className={cn(
              'text-sm px-2 py-1 rounded flex items-center gap-2',
              isSelected && isCorrect && 'bg-green-50 border border-green-200',
              isSelected && !isCorrect && 'bg-red-50 border border-red-200',
              !isSelected && isCorrect && 'bg-blue-50 border border-blue-200',
              !isSelected && !isCorrect && 'text-muted-foreground',
            )}
          >
            {isSelected && isCorrect && <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />}
            {isSelected && !isCorrect && <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
            {!isSelected && isCorrect && <CheckCircle className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
            <span>{opt.text}</span>
            {isSelected && <Badge variant="outline" className="text-[10px] ml-auto">Selected</Badge>}
            {isCorrect && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Correct</Badge>}
          </div>
        );
      })}
    </div>
  );
}
