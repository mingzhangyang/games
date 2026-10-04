// Fixed stylesheet data. No DOM access or executable expressions belong here.
export const STYLE_SOURCES = Object.freeze({
    'error-notification': `@keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                .error-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .error-icon {
                    font-size: 20px;
                }
                .error-text {
                    flex: 1;
                    font-size: 14px;
                    line-height: 1.4;
                }
                .error-dismiss {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .error-dismiss:hover {
                    background: rgba(255,255,255,0.3);
                }`,
    'score-popup': `@keyframes scoreFloat {
                    0% {
                        transform: translateY(0px);
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(-50px);
                        opacity: 0;
                    }
                }`,
    'mobile': `.mobile-active {
                transform: scale(0.95) !important;
                opacity: 0.8 !important;
                transition: transform 0.1s ease, opacity 0.1s ease !important;
            }
           \x20
            .orientation-landscape.landscape-compact #game-header {
                padding: 4px 8px !important;
                min-height: 40px !important;
            }
           \x20
            .orientation-landscape.landscape-compact .score-display span:last-child,
            .orientation-landscape.landscape-compact .combo-display span:last-child,
            .orientation-landscape.landscape-compact .level-display span:last-child,
            .orientation-landscape.landscape-compact .time-display span:last-child,
            .orientation-landscape.landscape-compact .lives-display span:last-child {
                font-size: 14px !important;
            }
           \x20
            .keyboard-visible #target-area {
                padding: 10px 15px !important;
            }
           \x20
            .keyboard-visible #target-number {
                font-size: 32px !important;
            }
           \x20
            /* High contrast mode for outdoor visibility */
            @media (prefers-contrast: high) {
                .control-btn, .menu-btn, .start-btn {
                    border-width: 3px !important;
                }
            }`,
    'low-end': `@media (max-width: 768px) {
                * {
                    animation-duration: 0.1s !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.1s !important;
                }
               \x20
                .screen-content {
                    backdrop-filter: none !important;
                }
               \x20
                #game-header {
                    backdrop-filter: none !important;
                }
               \x20
                .tool-bar {
                    backdrop-filter: none !important;
                }
            }`,
    'notification': `@keyframes slideInFromRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }`,
});
