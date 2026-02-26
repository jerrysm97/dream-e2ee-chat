/**
 * TicTacToeWidget.tsx
 *
 * P2P Tic-Tac-Toe game widget transmitted purely over WebRTC data channels.
 * Zero Supabase interaction — all game state is ephemeral.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Circle, RotateCcw, Zap } from "lucide-react";
import type { GameMovePayload } from "../hooks/useWebRTC";

const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: string[]): { winner: string; line: number[] } | null {
    for (const [a, b, c] of WIN_LINES) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line: [a, b, c] };
        }
    }
    return null;
}

function checkDraw(board: string[]): boolean {
    return board.every(cell => cell !== "");
}

interface TicTacToeWidgetProps {
    mySymbol: "X" | "O";
    sendGameMove: (index: number, player: "X" | "O") => void;
    setOnGameMove: (cb: ((move: GameMovePayload) => void) | null) => void;
    onClose: () => void;
}

const TicTacToeWidget: React.FC<TicTacToeWidgetProps> = ({
    mySymbol,
    sendGameMove,
    setOnGameMove,
    onClose,
}) => {
    const opponentSymbol = mySymbol === "X" ? "O" : "X";
    const [board, setBoard] = useState<string[]>(Array(9).fill(""));
    const [isMyTurn, setIsMyTurn] = useState(mySymbol === "X");
    const [winResult, setWinResult] = useState<{ winner: string; line: number[] } | null>(null);
    const [isDraw, setIsDraw] = useState(false);

    useEffect(() => {
        setOnGameMove((move: GameMovePayload) => {
            if (move.game !== "tictactoe") return;
            const { index, player } = move.payload;

            setBoard(prev => {
                if (prev[index] !== "") return prev;
                const next = [...prev];
                next[index] = player;

                const result = checkWinner(next);
                if (result) {
                    setWinResult(result);
                } else if (checkDraw(next)) {
                    setIsDraw(true);
                }

                return next;
            });
            setIsMyTurn(true);
        });

        return () => setOnGameMove(null);
    }, [setOnGameMove]);

    const handleCellClick = useCallback((index: number) => {
        if (!isMyTurn || board[index] !== "" || winResult || isDraw) return;

        const newBoard = [...board];
        newBoard[index] = mySymbol;
        setBoard(newBoard);
        setIsMyTurn(false);

        sendGameMove(index, mySymbol);

        const result = checkWinner(newBoard);
        if (result) {
            setWinResult(result);
        } else if (checkDraw(newBoard)) {
            setIsDraw(true);
        }
    }, [isMyTurn, board, mySymbol, winResult, isDraw, sendGameMove]);

    const resetGame = useCallback(() => {
        setBoard(Array(9).fill(""));
        setWinResult(null);
        setIsDraw(false);
        setIsMyTurn(mySymbol === "X");
    }, [mySymbol]);

    const gameOver = !!winResult || isDraw;
    const statusText = gameOver
        ? winResult
            ? winResult.winner === mySymbol ? "🎉 You Win!" : "💀 You Lose"
            : "🤝 Draw"
        : isMyTurn
            ? "Your Turn"
            : "Opponent's Turn…";

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.9, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 30, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-dream-border"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-dream-primary/10 flex items-center justify-center">
                            <Zap size={18} className="text-dream-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-dream-text text-base">Tic-Tac-Toe</h3>
                            <p className="text-[10px] text-dream-muted uppercase tracking-widest">P2P · WebRTC</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-dream-muted hover:text-dream-text p-2 rounded-lg hover:bg-dream-surface transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Status */}
                <div className={`text-center mb-4 text-sm font-semibold tracking-wide py-2 rounded-xl border transition-colors
                    ${gameOver
                        ? winResult?.winner === mySymbol
                            ? "text-dream-online bg-green-50 border-green-200"
                            : winResult
                                ? "text-dream-danger bg-red-50 border-red-200"
                                : "text-amber-600 bg-amber-50 border-amber-200"
                        : isMyTurn
                            ? "text-dream-primary bg-dream-primary/5 border-dream-primary/20"
                            : "text-dream-muted bg-dream-surface border-dream-border"
                    }`}
                >
                    {statusText}
                    <span className="ml-2 text-xs opacity-60">
                        (You: {mySymbol})
                    </span>
                </div>

                {/* Board Grid */}
                <div className="grid grid-cols-3 gap-2 mb-5">
                    {board.map((cell, i) => {
                        const isWinCell = winResult?.line.includes(i);
                        return (
                            <motion.button
                                key={i}
                                whileHover={!cell && isMyTurn && !gameOver ? { scale: 1.05 } : {}}
                                whileTap={!cell && isMyTurn && !gameOver ? { scale: 0.95 } : {}}
                                onClick={() => handleCellClick(i)}
                                disabled={!!cell || !isMyTurn || gameOver}
                                className={`
                                    aspect-square rounded-xl border flex items-center justify-center
                                    text-3xl font-black transition-all duration-200 relative overflow-hidden
                                    ${cell
                                        ? isWinCell
                                            ? "bg-dream-primary/10 border-dream-primary/40 shadow-sm"
                                            : "bg-dream-surface border-dream-border"
                                        : isMyTurn && !gameOver
                                            ? "bg-dream-surface border-dream-border hover:border-dream-primaryLight hover:bg-dream-primary/5 cursor-pointer"
                                            : "bg-dream-surface/50 border-dream-border/50 cursor-not-allowed"
                                    }
                                `}
                            >
                                <AnimatePresence>
                                    {cell && (
                                        <motion.div
                                            initial={{ scale: 0, rotate: -180 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            transition={{ type: "spring", damping: 12 }}
                                        >
                                            {cell === "X" ? (
                                                <X size={36} strokeWidth={3} className="text-dream-primary" />
                                            ) : (
                                                <Circle size={32} strokeWidth={3} className="text-blue-500" />
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.button>
                        );
                    })}
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={resetGame}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-dream-surface border border-dream-border text-dream-text hover:bg-dream-border/50 transition-all"
                    >
                        <RotateCcw size={14} />
                        New Game
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-dream-danger hover:bg-red-100 transition-all"
                    >
                        Leave
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default TicTacToeWidget;
