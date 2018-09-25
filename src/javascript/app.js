Ext.define("custom-grid-with-deep-export", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    layout: {
        type:'vbox',
        align: 'stretch'
    },
    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container'
    },{
        id: 'grid-area',
        xtype: 'container',
        flex: 1,
        type: 'vbox',
        align: 'stretch'
    }],
    config: {
        defaultSettings: {
            columnNames: ['FormattedID', 'Name','ScheduleState'] ,
            query: '',
            showControls: true,
            type: 'HierarchicalRequirement',
            pageSize: 50,
            searchAllProjects: false,
        }
    },

    integrationHeaders : {
        name : "custom-grid-with-deep-export"
    },

    disallowedAddNewTypes: ['user', 'userprofile', 'useriterationcapacity', 'testcaseresult', 'task', 'scmrepository', 'project', 'changeset', 'change', 'builddefinition', 'build', 'program'],
    orderedAllowedPageSizes: [10, 25, 50, 100, 200],
    readOnlyGridTypes: ['build', 'change', 'changeset'],
    statePrefix: 'customlist',
    allowExpansionStateToBeSaved: false,
    enableAddNew: true,
    onTimeboxScopeChange: function(newTimeboxScope) {
        this.callParent(arguments);
        this._buildStore();
    },
    plugins: [{
        ptype: 'UtilsAncestorPiAppFilter',
        pluginId: 'ancestorFilterPlugin',
    }],
    launch: function () {
        this.fetchPortfolioItemTypes().then({
            success: function(portfolioItemTypes){
                this.portfolioItemTypes = portfolioItemTypes;
                this._buildStore();
            },
            failure: function(msg){
                this._showError(msg);
            },
            scope: this
        });
        var listenerConfig = {
            scope: this
        }
        this.getPlugin('ancestorFilterPlugin')
            .on(Utils.AncestorPiAppFilter.PI_SELECTED, function() {
            this._buildStore();
        }, this);

    },
    
    // Usual monkey business to size gridboards
    onResize: function() {
        this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if ( gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },
    
    _buildStore: function(){

        this.modelNames = [this.getSetting('type')];
        this.logger.log('_buildStore', this.modelNames);
        var fetch = ['FormattedID', 'Name'];
        var dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: this.modelNames,
            enableHierarchy: true,
            remoteSort: true,
            fetch: fetch,
            context: dataContext
        }).then({
            success: this._addGridboard,
            scope: this
        });
    },
    _addGridboard: function(store) {
        var gridArea = this.down('#grid-area')
        gridArea.removeAll();

        var filters = this.getSetting('query') ? [Rally.data.wsapi.Filter.fromQueryString(this.getSetting('query'))] : [];
        var timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }
        var ancestorFilterPlugin = this.getPlugin('ancestorFilterPlugin');
        filters = filters.concat(ancestorFilterPlugin.getFiltersForType(this.modelNames[0]));
        this.logger.log('_addGridboard', store);

        var context = this.getContext();
        var dataContext = context.getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        var summaryRowFeature = Ext.create('Rally.ui.grid.feature.SummaryRow');
        this.gridboard = gridArea.add({
                xtype: 'rallygridboard',
                context: context,
                modelNames: this.modelNames,
                toggleState: 'grid',
                height: gridArea.getHeight(),
                plugins: [
                    'rallygridboardaddnew',
                    {
                        ptype: 'rallygridboardinlinefiltercontrol',
                        inlineFilterButtonConfig: {
                            stateful: true,
                            stateId: this.getContext().getScopedStateId('filters-1'),
                            modelNames: this.modelNames,
                            inlineFilterPanelConfig: {
                                quickFilterPanelConfig: {
                                    whiteListFields: [
                                       'Tags',
                                       'Milestones'
                                    ],
                                    defaultFields: [
                                        'ArtifactSearch',
                                        'Owner',
                                        'ModelType',
                                        'Milestones'
                                    ]
                                }
                            }
                        }
                    },
                    {
                        ptype: 'rallygridboardfieldpicker',
                        headerPosition: 'left',
                        modelNames: this.modelNames,
                        stateful: true,
                        stateId: this.getContext().getScopedStateId('field-picker')
                    },
                    {
                        ptype: 'rallygridboardactionsmenu',
                        menuItems: this._getExportMenuItems(),
                        buttonConfig: {
                            iconCls: 'icon-export'
                        }
                    },
                    {
                        ptype: 'rallygridboardsharedviewcontrol',
                        stateful: true,
                        stateId: this.getContext().getScopedStateId('shared-views')
                    }
                ],
                cardBoardConfig: {
                    attribute: 'ScheduleState'
                },
                gridConfig: {
                    store: store,
                    storeConfig: {
                        filters: filters,
                        context: dataContext
                    },
                    columnCfgs: [
                        'Name',
                        {
                            dataIndex: 'PlanEstimate',
                            summaryType: 'sum'
                        },
                        {
                            dataIndex: 'TaskRemainingTotal',
                            summaryType: 'sum'
                        },
                        {
                            dataIndex: 'ToDo',
                            summaryType: 'sum'
                        },
                        {
                            dataIndex: 'TaskEstimateTotal',
                            summaryType: 'sum'
                        }
                    ],
                    features: [summaryRowFeature]
                }
        });
    },
    _getExportMenuItems: function(){
        var result = [];
        this.logger.log('_getExportMenuItems', this.modelNames[0]);
        var currentModel = this.modelNames[0].toLowerCase();
        if (currentModel === 'hierarchicalrequirement'){
            result = [{
                text: 'Export User Stories...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement']
            },{
                text: 'Export User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement','task']
            },{
                text: 'Export User Stories and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement','task','defect','testcase']
            }];
        } else if (currentModel.startsWith("portfolioitem")) {
            var idx = _.indexOf(this.getPortfolioItemTypeNames(), currentModel);
            var childModels = [];
            if (idx > 0){
                for (var i = idx; i > 0; i--){
                    childModels.push(this.getPortfolioItemTypeNames()[i-1].toLowerCase());
                }
            }
    
            result = [{
                text: 'Export Portfolio Items...',
                handler: this._export,
                scope: this,
                childModels: childModels
            },{
                text: 'Export Portfolio Items and User Stories...',
                handler: this._export,
                scope: this,
                includeStories: true,
                includeTasks: false,
                childModels: childModels.concat(['hierarchicalrequirement'])
            },{
                text: 'Export Portfolio Items, User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement','task'])
            },{
                text: 'Export Portfolio Items and Child Items...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement','defect','testcase'])
            }];
        } else if (currentModel == 'defect') {
            result = [{
                text: 'Export Defects...',
                handler: this._export,
                scope: this,
                childModels: []
            },{
                text: 'Export Defects and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect', 'task', 'testcase']
            }];
        } else if (currentModel == 'testcase') {
            result = [{
                text: 'Export Test Cases...',
                handler: this._export,
                scope: this,
                childModels: []
            },{
                text: 'Export Test Cases and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect', 'task', 'testcase']
            }];
        } else {
            result = [{
                text: 'Export to CSV...',
                handler: this._export,
                scope: this,
                childModels: []
            }];
        }
        
        return result;
    },
    getPortfolioItemTypeNames: function(){
        return _.pluck(this.portfolioItemTypes, 'typePath');
    },

    _showError: function(msg){
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    _showStatus: function(message){
        this.logger.log('_showstatus', message, this);
        if (message) {
           Rally.ui.notify.Notifier.showStatus({
                message: message,
                showForever: true,
                closable: false,
                animateShowHide: false
            });
        } else {
            Rally.ui.notify.Notifier.hide();
        }
    },
    _getExportColumns: function(){
        var grid = this.down('rallygridboard').getGridOrBoard();
        if (grid){
            return _.filter(grid.columns, function(item){
                return (
                    item.dataIndex &&
                    item.dataIndex != "DragAndDropRank" &&
                    item.xtype &&
                    item.xtype != "rallytreerankdraghandlecolumn" &&
                    item.xtype != "rallyrowactioncolumn" &&
                    item.text != "&#160;");
            });
        }
        return [];
    },
    _getExportFilters: function(){
        var grid = this.down('rallygridboard'),
            filters = [],
            query = this.getSetting('query');

        if (grid.currentCustomFilter && grid.currentCustomFilter.filters){
            filters = grid.currentCustomFilter.filters;
        }

        if (query) {
            filters.push(Rally.data.wsapi.Filter.fromQueryString(query));
        }

        var timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(grid.getGridOrBoard().store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }
        return filters;
    },
    _getExportFetch: function(){
        var fetch =  _.pluck(this._getExportColumns(), 'dataIndex');
        if (Ext.Array.contains(fetch, 'TaskActualTotal')){
            fetch.push('Actuals');
        }
        return fetch;
    },
    _getExportSorters: function(){
        return this.down('rallygridboard').getGridOrBoard().getStore().getSorters();
    },
    _export: function(args){
        var columns = this._getExportColumns(),
            fetch = this._getExportFetch(),
            filters = this._getExportFilters(),
            modelName = this.modelNames[0],
            childModels = args.childModels,
            sorters = this._getExportSorters();

        this.logger.log('_export', fetch, args, columns, filters.toString(), childModels, sorters);

        var exporter = Ext.create('Rally.technicalservices.HierarchyExporter', {
            modelName: modelName,
            fileName: 'hierarchy-export.csv',
            columns: columns,
            portfolioItemTypeObjects: this.portfolioItemTypes

        });
        exporter.on('exportupdate', this._showStatus, this);
        exporter.on('exporterror', this._showError, this);
        exporter.on('exportcomplete', this._showStatus, this);

        var dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        var hierarchyLoader = Ext.create('Rally.technicalservices.HierarchyLoader',{
            model: modelName,
            fetch: fetch,
            filters: filters,
            sorters: sorters,
            loadChildModels: childModels,
            portfolioItemTypes: this.portfolioItemTypes,
            context: dataContext
        });
        hierarchyLoader.on('statusupdate', this._showStatus, this);
        hierarchyLoader.on('hierarchyloadartifactsloaded', exporter.setRecords, exporter);
        hierarchyLoader.on('hierarchyloadcomplete', exporter.export, exporter);
        hierarchyLoader.on('hierarchyloaderror', this._showError, this)
        hierarchyLoader.load();
    },
    getHeight: function () {
        var el = this.getEl();
        if (el) {
            var height = this.callParent(arguments);
            return Ext.isIE8 ? Math.max(height, 600) : height;
        }

        return 0;
    },

    setHeight: function(height) {
        this.callParent(arguments);
        if(this.gridboard) {
            this.gridboard.setHeight(height);
        }
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },

    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    isMilestoneScoped: function() {
        var result = false;
        
        var tbscope = this.getContext().getTimeboxScope();
        if (tbscope && tbscope.getType() == 'milestone') {
            result = true;
        }
        return result
    },
    
    searchAllProjects: function() {
        var searchAllProjects = this.getSetting('searchAllProjects');
        return this.isMilestoneScoped() && searchAllProjects;
    },
    
    getSettingsFields: function(){
        return Rally.technicalservices.CustomGridWithDeepExportSettings.getFields({
            showSearchAllProjects: this.isMilestoneScoped()
        });
    },
    fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');

        var store = Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            fetch: ['TypePath', 'Ordinal','Name'],
            filters: [
                {
                    property: 'Parent.Name',
                    operator: '=',
                    value: 'Portfolio Item'
                },
                {
                    property: 'Creatable',
                    operator: '=',
                    value: 'true'
                }
            ],
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }]
        });
        store.load({
            callback: function(records, operation, success){

                if (success){
                    var portfolioItemTypes = new Array(records.length);
                    _.each(records, function(d){
                        //Use ordinal to make sure the lowest level portfolio item type is the first in the array.
                        var idx = Number(d.get('Ordinal'));
                        portfolioItemTypes[idx] = { typePath: d.get('TypePath').toLowerCase(), name: d.get('Name') };
                        //portfolioItemTypes.reverse();
                    });
                    deferred.resolve(portfolioItemTypes);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error loading Portfolio Item Types:  ' + error_msg);
                }
            }
        });
        return deferred.promise;
    }
});
