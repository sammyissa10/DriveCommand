'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { submitDocFeedback } from '@/actions/doc-feedback';
import { toast } from 'sonner';

interface FeedbackWidgetProps {
  docSlug: string;
}

type FeedbackState = 'initial' | 'comment' | 'submitted';

export function FeedbackWidget({ docSlug }: FeedbackWidgetProps) {
  const [state, setState] = useState<FeedbackState>('initial');
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVote = async (isHelpful: boolean) => {
    setHelpful(isHelpful);

    // If helpful, submit immediately
    if (isHelpful) {
      setIsSubmitting(true);
      const result = await submitDocFeedback({ docSlug, helpful: true });
      setIsSubmitting(false);

      if (result.success) {
        setState('submitted');
      } else {
        toast.error(result.error || 'Failed to submit feedback');
      }
    } else {
      // If not helpful, show comment form
      setState('comment');
    }
  };

  const handleSubmitWithComment = async () => {
    if (helpful === null) return;

    setIsSubmitting(true);
    const result = await submitDocFeedback({
      docSlug,
      helpful,
      comment: comment.trim() || undefined,
    });
    setIsSubmitting(false);

    if (result.success) {
      setState('submitted');
    } else {
      toast.error(result.error || 'Failed to submit feedback');
    }
  };

  if (state === 'submitted') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-green-500" />
        Thanks for your feedback!
      </div>
    );
  }

  if (state === 'comment') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">What could we improve?</p>
        <Textarea
          placeholder="Tell us how we can make this article better..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSubmitWithComment}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              'Sending...'
            ) : (
              <>
                <Send className="h-3 w-3 mr-1" />
                Send Feedback
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setState('initial');
              setComment('');
              setHelpful(null);
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted-foreground">Was this article helpful?</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVote(true)}
          disabled={isSubmitting}
          className="gap-1"
        >
          <ThumbsUp className="h-4 w-4" />
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVote(false)}
          disabled={isSubmitting}
          className="gap-1"
        >
          <ThumbsDown className="h-4 w-4" />
          No
        </Button>
      </div>
    </div>
  );
}
