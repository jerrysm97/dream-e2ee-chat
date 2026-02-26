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
                if (result) setWinResult(result);
                else if (checkDraw(next)) setIsDraw(true);
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
        if (result) setWinResult(result);
        else if (checkDraw(newBoard)) setIsDraw(true);
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
            className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
            style={{ background: 'rgba(13, 0, 0, 0.92)' }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.97, y: -8, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.97, y: -8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-zk-surface p-6 w-full max-w-sm shadow-zk-panel border border-[rgba(201,168,76,0.35)]"
                style={{ borderRadius: '4px' }}
            >
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-zk-maroon flex items-center justify-center" style={{ borderRadius: '2px' }}>
                            <Zap size={18} className="text-zk-gold" />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-zk-ivory text-base">Tic-Tac-Toe</h3>
                            <p className="text-[10px] text-zk-ash uppercase tracking-widest font-mono">P2P · WebRTC</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zk-ash hover:text-zk-ivory p-2 transition-colors" style={{ borderRadius: '2px' }}>
                        <X size={18} />
                    </button>
                </div>

                <div className={`text-center mb-4 text-sm font-semibold tracking-wide py-2 border transition-colors font-mono ${gameOver
                    ? winResult?.winner === mySymbol
                        ? "text-zk-gold bg-[rgba(201,168,76,0.08)] border-[rgba(201,168,76,0.25)]"
                        : winResult
                            ? "text-zk-crimson bg-[rgba(192,57,43,0.10)] border-[rgba(192,57,43,0.25)]"
                            : "text-zk-ember bg-[rgba(139,111,71,0.10)] border-[rgba(139,111,71,0.25)]"
                    : isMyTurn
                        ? "text-zk-gold bg-[rgba(201,168,76,0.05)] border-[rgba(201,168,76,0.15)]"
                        : "text-zk-ash bg-zk-deep border-[rgba(201,168,76,0.08)]"
                    }`} style={{ borderRadius: '4px' }}>
                    {statusText}
                    <span className="ml-2 text-xs opacity-60">(You: {mySymbol})</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-5">
                    {board.map((cell, i) => {
                        const isWinCell = winResult?.line.includes(i);
                        return (
                            <motion.button
                                key={i}
                                whileTap={!cell && isMyTurn && !gameOver ? { scale: 0.95 } : {}}
                                onClick={() => handleCellClick(i)}
                                disabled={!!cell || !isMyTurn || gameOver}
                                className={`aspect-square border flex items-center justify-center text-3xl font-black transition-all duration-150 ${cell
                                    ? isWinCell
                                        ? "bg-[rgba(201,168,76,0.10)] border-[rgba(201,168,76,0.35)] shadow-zk-gold"
                                        : "bg-zk-deep border-[rgba(201,168,76,0.08)]"
                                    : isMyTurn && !gameOver
                                        ? "bg-zk-deep border-[rgba(201,168,76,0.08)] hover:border-[rgba(201,168,76,0.25)] hover:bg-[rgba(107,26,26,0.10)] cursor-pointer"
                                        : "bg-zk-deep border-[rgba(201,168,76,0.05)] cursor-not-allowed opacity-50"
                                    }`}
                                style={{ borderRadius: '4px' }}
                            >
                                <AnimatePresence>
                                    {cell && (
                                        <motion.div
                                            initial={{ scale: 0, rotate: -180 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            transition={{ type: "spring", damping: 12 }}
                                        >
                                            {cell === "X" ? (
                                                <X size={36} strokeWidth={3} className="text-zk-gold" />
                                            ) : (
                                                <Circle size={32} strokeWidth={3} className="text-zk-gold-pale" />
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.button>
                        );
                    })}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={resetGame}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-zk-deep border border-[rgba(201,168,76,0.12)] text-zk-ivory hover:bg-[rgba(107,26,26,0.15)] transition-all font-body"
                        style={{ borderRadius: '2px' }}
                    >
                        <RotateCcw size={14} />
                        New Game
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-medium bg-[rgba(192,57,43,0.10)] border border-[rgba(192,57,43,0.20)] text-zk-crimson hover:bg-[rgba(192,57,43,0.20)] transition-all font-body"
                        style={{ borderRadius: '2px' }}
                    >
                        Leave
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default TicTacToeWidget;
