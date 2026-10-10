// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute the real widget with only its desktop host replaced. React rendering stays real.
function renderWidget(state) {
    const filename = path.join(__dirname, '../lib/browser/goldie/goldie-widget.js');
    const localRequire = createRequire(filename);
    const exports = {};
    const context = { exports, require: id => {
        if (id.endsWith('.css')) { return {}; }
        if (id === '@theia/core/lib/browser/widgets/react-widget') { return { ReactWidget: class {} }; }
        if (id === '@theia/core/lib/browser/widgets') { return { codicon: name => `codicon codicon-${name}` }; }
        if (id === '@theia/core/shared/inversify') { return { inject: () => () => {}, injectable: () => value => value, postConstruct: () => {} }; }
        return localRequire(id);
    } };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    const widget = Object.create(exports.GoldieWidget.prototype);
    Object.assign(widget, { lessonState: state, connectionState: 'Connected', connectionDetail: 'Ready', questionDraft: '', questionComposerOpen: false });
    return renderToStaticMarkup(widget.render());
}
module.exports = { renderWidget };

function viewContribution({ restored, width }) {
    const filename = path.join(__dirname, '../lib/browser/goldie/goldie-view-contribution.js');
    const exports = {};
    const localRequire = createRequire(filename);
    const widget = { isAttached: restored, node: { getBoundingClientRect: () => ({ width }) } };
    class ViewHost {
        constructor() { this.resizes = []; this.shell = { resize: (...args) => this.resizes.push(args) }; }
        tryGetWidget() { return widget; }
        async openView() { widget.isAttached = true; return widget; }
    }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports, require: id => {
        if (id === '@theia/core/shared/inversify') { return { injectable: () => value => value }; }
        if (id === '@theia/core/lib/browser/shell/view-contribution') { return { AbstractViewContribution: ViewHost }; }
        if (id === './goldie-widget') { return { GoldieWidget: { ID: 'goldie:panel' } }; }
        return localRequire(id);
    } }, { filename });
    return new exports.GoldieViewContribution();
}
module.exports.viewContribution = viewContribution;
