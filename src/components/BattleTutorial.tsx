import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface BattleTutorialProps {
  onClose: () => void;
}

const tutorialSteps = [
  {
    title: "Welcome to Grid-Based Combat!",
    description: "This is a tactical turn-based battle system on an isometric grid. Your party members are on the RIGHT side (diagonal line), enemies are on the LEFT.",
    image: "🎮",
  },
  {
    title: "Turn Order",
    description: "Combat is turn-based. The character with the highest SPD (speed) stat goes first. Check the 'Current Turn' panel in the middle to see whose turn it is.",
    image: "⏱️",
  },
  {
    title: "Your Actions (Player Turn)",
    description: "When it's YOUR turn, you'll see action buttons:\n• MOVE: Click to highlight reachable tiles (blue), then click a tile to move there\n• ATTACK: Click to highlight enemies in range (adjacent tiles), then click an enemy to attack\n• DEFEND: Reduces damage taken until your next turn\n• SKILL: Use special abilities (if you have MP)",
    image: "⚔️",
  },
  {
    title: "How to Attack",
    description: "1. Click the 'Attack' button\n2. Tiles with enemies in range (adjacent to you) will highlight in RED\n3. Click on an enemy tile to attack them\n4. Damage is calculated: (Your ATK - Enemy DEF) = Damage dealt",
    image: "💥",
  },
  {
    title: "How to Move",
    description: "1. Click the 'Move' button\n2. Reachable tiles will highlight in CYAN/BLUE\n3. Click a highlighted tile to move there\n4. You can move up to your movement range (usually 3 tiles) per turn",
    image: "👣",
  },
  {
    title: "Enemy Turn",
    description: "When it's the ENEMY's turn, they will automatically move toward you and attack if you're in range. Watch the battle log to see what they do!",
    image: "👹",
  },
  {
    title: "Victory Conditions",
    description: "• WIN: Defeat all enemies (reduce their HP to 0)\n• LOSE: All party members reach 0 HP\n\nStrategy tip: Position your characters to surround enemies, and use Defend when low on HP!",
    image: "🏆",
  },
];

export const BattleTutorial: React.FC<BattleTutorialProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  
  const step = tutorialSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border-4 border-slate-600 rounded-lg max-w-2xl w-full p-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        
        {/* Step Counter */}
        <div className="text-center mb-4">
          <span className="text-sm text-gray-400">
            Step {currentStep + 1} of {tutorialSteps.length}
          </span>
        </div>
        
        {/* Emoji Icon */}
        <div className="text-center text-6xl mb-4">
          {step.image}
        </div>
        
        {/* Title */}
        <h2 className="text-2xl font-bold text-white text-center mb-4">
          {step.title}
        </h2>
        
        {/* Description */}
        <div className="text-gray-300 text-base leading-relaxed mb-6 whitespace-pre-line text-center">
          {step.description}
        </div>
        
        {/* Navigation Buttons */}
        <div className="flex justify-between items-center gap-4">
          <Button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={isFirstStep}
            variant="outline"
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          
          <div className="flex gap-2">
            {tutorialSteps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full ${
                  index === currentStep ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
          
          {isLastStep ? (
            <Button
              onClick={onClose}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              Got It!
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentStep(Math.min(tutorialSteps.length - 1, currentStep + 1))}
              className="flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        {/* Skip Tutorial */}
        <div className="text-center mt-4">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-300 underline transition-colors"
          >
            Skip Tutorial
          </button>
        </div>
      </div>
    </div>
  );
};
