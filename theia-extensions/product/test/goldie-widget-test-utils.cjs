// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute the real widget with only its desktop host replaced. React rendering stays real.
function createWidget(state, { detailsOpen = false, recorderState = { status: 'idle' }, practice,
    workspaceState = { connected: false, status: 'Connect this project to learn from Codex updates.' }, canChangeContext = true } = {}) {
    const filename = path.join(__dirname, '../lib/browser/goldie/goldie-widget.js');
    const localRequire = createRequire(filename);
    const exports = {};
    const context = { exports, clearTimeout,
        window: { addEventListener() {}, removeEventListener() {} },
        document: { addEventListener() {}, removeEventListener() {} }, require: id => {
        if (id.endsWith('.css')) { return {}; }
        if (id === '@theia/core/lib/browser/widgets/react-widget') { return { ReactWidget: class { dispose() {} } }; }
        if (id === './goldie-workspace-connection') { return { GoldieWorkspaceConnection: class {} }; }
        if (id === '@theia/core/lib/browser/shell/application-shell') { return { ApplicationShell: class {} }; }
        if (id === '@theia/core/lib/browser/widgets') { return { codicon: name => `codicon codicon-${name}` }; }
        if (id === '@theia/core/shared/inversify') { return { inject: () => () => {}, injectable: () => value => value, postConstruct: () => {} }; }
        return localRequire(id);
    } };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    const widget = Object.create(exports.GoldieWidget.prototype);
    Object.assign(widget, {
        lessonState: state, connectionState: 'Connected', connectionDetail: 'Ready',
        detailsOpen, recorderState, microphoneLevelRef: { current: 0 }, loadingHandoff: false, workspaceState, connectingWorkspace: false, selectedLevel: 'beginner',
        workspaceConnection: { connect: async () => {}, disconnect() {}, learnLatest: async () => {} },
        lessonController: {
            canChangeContext, practice,
            prepareVoiceQuestion: async () => true, submitVoiceQuestion: async () => {}, cancelVoiceQuestion() {},
            continueAfterPractice: async () => {}, openPractice: async () => {}
        }
    });
    return widget;
}
function renderWidget(state, options) { return renderToStaticMarkup(createWidget(state, options).render()); }
module.exports = { renderWidget, createWidget };

function viewContribution({ restored, width }) {
    const filename = path.join(__dirname, '../lib/browser/goldie/goldie-view-contribution.js');
    const exports = {};
    const localRequire = createRequire(filename);
    const widget = { isAttached: restored, isVisible: restored, onDidChangeVisibility() {}, onDidDispose() {}, node: { getBoundingClientRect: () => ({ width }) } };
    class ViewHost {
        constructor() { this.resizes = []; this.shell = { resize: (...args) => this.resizes.push(args) }; }
        tryGetWidget() { return widget; }
        async openView() { widget.isAttached = true; return widget; }
    }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports, require: id => {
        if (id === '@theia/core/shared/inversify') { return { injectable: () => value => value, inject: () => () => {} }; }
        if (id === '@theia/core/lib/browser/shell/view-contribution') { return { AbstractViewContribution: ViewHost }; }
        if (id === '@theia/core/lib/browser/status-bar/status-bar') { return { StatusBar: Symbol('StatusBar'), StatusBarAlignment: { RIGHT: 1 } }; }
        if (id === './goldie-widget') { return { GoldieWidget: { ID: 'goldie:panel' } }; }
        return localRequire(id);
    } }, { filename });
    const contribution = new exports.GoldieViewContribution();
    contribution.statusBar = { setElement: async () => {} };
    return contribution;
}
module.exports.viewContribution = viewContribution;
