"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import {
  QUIZ_QUESTIONS,
  ROOMMATE_PERSONALITIES,
  calculateQuizResult,
  type RoommatePersonalityId,
} from "@/lib/quiz-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const QUESTION_COUNT = QUIZ_QUESTIONS.length;

export function RoommateQuiz() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(RoommatePersonalityId | null)[]>(
    Array.from({ length: QUESTION_COUNT }, () => null),
  );
  const [showResult, setShowResult] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const currentQuestion = QUIZ_QUESTIONS[currentQuestionIndex];

  const result = useMemo(() => {
    const completedAnswers = answers.filter(
      (answer): answer is RoommatePersonalityId => answer !== null,
    );
    return calculateQuizResult(completedAnswers);
  }, [answers]);

  const progressPercent = Math.round(((currentQuestionIndex + 1) / QUESTION_COUNT) * 100);

  const transitionToQuestion = (nextQuestionIndex: number, nextDirection: "next" | "prev") => {
    setDirection(nextDirection);
    setIsTransitioning(true);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setCurrentQuestionIndex(nextQuestionIndex);
      setIsTransitioning(false);
    }, 220);
  };

  const handleAnswerSelect = (personality: RoommatePersonalityId) => {
    setAnswers((previousAnswers) => {
      const nextAnswers = [...previousAnswers];
      nextAnswers[currentQuestionIndex] = personality;
      return nextAnswers;
    });

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      if (currentQuestionIndex === QUESTION_COUNT - 1) {
        setShowResult(true);
        return;
      }

      transitionToQuestion(currentQuestionIndex + 1, "next");
    }, 300);
  };

  const handleBack = () => {
    if (currentQuestionIndex === 0 || isTransitioning) {
      return;
    }

    transitionToQuestion(currentQuestionIndex - 1, "prev");
  };

  const handleRetake = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    setAnswers(Array.from({ length: QUESTION_COUNT }, () => null));
    setCurrentQuestionIndex(0);
    setShowResult(false);
    setIsTransitioning(false);
    setDirection("next");
  };

  if (showResult) {
    const personality = ROOMMATE_PERSONALITIES[result];

    return (
      <Card className="py-0">
        <CardHeader>
          <CardTitle>Your compatibility vibe</CardTitle>
          <CardDescription>Here is your roommate personality profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-3xl">{personality.emoji}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-900">{personality.name}</h3>
            <p className="mt-2 text-sm text-slate-700">{personality.description}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">Compatibility tips</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {personality.compatibilityTips.map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <span className="mt-1 size-1.5 rounded-full bg-slate-400" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="sm:flex-1">
              <Link href="/listings">Browse Compatible Listings</Link>
            </Button>
            <Button variant="outline" className="sm:flex-1" onClick={handleRetake}>
              <RotateCcw className="size-4" />
              Retake Quiz
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <CardHeader>
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm font-medium text-slate-600">
            Question {currentQuestionIndex + 1} of {QUESTION_COUNT}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-6">
        <div
          className={cn(
            "transition-all duration-300",
            isTransitioning
              ? direction === "next"
                ? "-translate-x-6 opacity-0"
                : "translate-x-6 opacity-0"
              : "translate-x-0 opacity-100",
          )}
        >
          <h3 className="text-lg font-semibold text-slate-900">{currentQuestion.question}</h3>
          <div className="mt-4 space-y-2">
            {currentQuestion.options.map((option) => {
              const isSelected = answers[currentQuestionIndex] === option.personality;

              return (
                <Button
                  key={option.id}
                  type="button"
                  onClick={() => handleAnswerSelect(option.personality)}
                  disabled={isTransitioning}
                  variant={isSelected ? "default" : "outline"}
                  className="h-auto w-full justify-start whitespace-normal px-4 py-3 text-left text-sm"
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentQuestionIndex === 0 || isTransitioning}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <span className="text-xs text-slate-500">Tap an option to continue</span>
        </div>
      </CardContent>
    </Card>
  );
}
