/* Copyright (c) 2019, UW Medicine Research IT, University of Washington
 * Developed by Nic Dobbins and Cliff Spital, CRIO Sean Mooney
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */ 

import moment from 'moment';
import React from 'react';
import { connect } from 'react-redux';
import { getIdToken } from '../actions/auth';
import { refreshSession, saveSessionAndLogout } from '../actions/session';
import { RouteConfig } from '../config/routes';
import Attestation from '../containers/Attestation/Attestation';
import CohortCountBox from '../containers/CohortCountBox/CohortCountBox';
import Header from '../containers/Header/Header';
import { AppState, AuthorizationState } from '../models/state/AppState';
import ExportState from '../models/state/Export';
import { Routes, ConfirmationModalState, InformationModalState, NoClickModalState } from '../models/state/GeneralUiState';
import { SessionContext } from '../models/Session';
import MyLeafModal from './MyLeafModal/MyLeafModal';
import SaveQueryPanel from './SaveQueryPanel/SaveQueryPanel';
import Sidebar from './Sidebar/Sidebar';
import InformationModal from '../components/Modals/InformationModal/InformationModal';
import ConfirmationModal from '../components/Modals/ConfirmationModal/ConfirmationModal';
import NoClickModal from '../components/Modals/NoClickModal/NoClickModal';
import { showInfoModal } from '../actions/generalUi';
import HelpButton from '../components/HelpButton/HelpButton';
import './App.css';


interface OwnProps {
}
interface DispatchProps {
    dispatch: any;
}
interface StateProps {
    auth?: AuthorizationState;
    confirmationModal: ConfirmationModalState;
    currentRoute: Routes;
    exportState: ExportState;
    informationModal: InformationModalState;
    noclickModal: NoClickModalState;
    routes: RouteConfig[];
    sessionContext?: SessionContext;
}

type Props = StateProps & DispatchProps & OwnProps;
let inactivityTimer: NodeJS.Timer;
let sessionTimer: NodeJS.Timer;

class App extends React.Component<Props> {
    private sessionTokenRefreshPaddingMinutes = 2;
    private heartbeatCheckIntervalSeconds = 10;
    private lastHeartbeat = new Date();

    constructor(props: Props) {
        super(props);
    }

    public componentDidMount() {
        const { dispatch } = this.props;
        this.handleBrowserHeartbeat();
        dispatch(getIdToken());
    }

    public componentDidUpdate() { 
        return; 
    }

    public getSnapshotBeforeUpdate(nextProps: Props) {
        const { sessionContext } = nextProps;
        if (sessionContext) {
            this.handleSessionTokenRefresh(sessionContext);
        }
        return null;
    }

    public render() {
        const { auth, currentRoute, confirmationModal, informationModal, dispatch, noclickModal, routes } = this.props;
        const content = routes.length 
            ? routes.find((r: RouteConfig) => r.index === currentRoute)!.render()
            : null;

        return (
            <div className="app-container" onMouseDown={this.handleActivity} onKeyDown={this.handleActivity}>
                <Attestation />
                <CohortCountBox />
                <Header />
                <Sidebar currentRoute={currentRoute} />
                <InformationModal informationModal={informationModal} dispatch={dispatch} />
                <ConfirmationModal confirmationModal={confirmationModal} dispatch={dispatch} />
                <NoClickModal state={noclickModal} dispatch={dispatch} />
                <HelpButton auth={auth} />
                {this.props.sessionContext &&
                <div id="main-content">
                    <SaveQueryPanel />
                    <MyLeafModal />
                    {content}
                </div>
                }
            </div>
        );
    }

    /*
     * Poll at short intervals to test that browser is active.
     * If the gap between 2 heartbeats is greater than twice
     * the polling interval, the browser was likely asleep, so
     * try to refresh the session.
     */
    private handleBrowserHeartbeat = () => {
        const { dispatch } = this.props;
        const now = new Date();
        const diffSeconds = (now.getTime() - this.lastHeartbeat.getTime()) / 1000;

        if (diffSeconds > (this.heartbeatCheckIntervalSeconds * 2)) {
            dispatch(refreshSession());
        }
        setTimeout(this.handleBrowserHeartbeat, this.heartbeatCheckIntervalSeconds * 1000);
        this.lastHeartbeat = now;
    }

    /*
     * Refresh user session token (should be short interval, e.g., 4 minutes).
     */
    private handleSessionTokenRefresh(ctx: SessionContext) {
        const { dispatch } = this.props;
        const refreshDtTm = moment(ctx.expirationDate).add(-this.sessionTokenRefreshPaddingMinutes, 'minute').toDate();
        const diffMs = refreshDtTm.getTime() - new Date().getTime();
        const timeoutMs = diffMs < 0 ? 0 : diffMs;

        if (sessionTimer) {
            clearTimeout(sessionTimer);
        }
        sessionTimer = setTimeout(() => {
            dispatch(refreshSession());
        }, timeoutMs);
    }

    /*
     * Handle user activity via mouse or key action, which resets the inactivity timeout.
     */
    private handleActivity = () => {
        const { dispatch, auth, sessionContext } = this.props;
        if (!sessionContext || auth!.config!.inactivityTimeoutMinutes <= 0) { return; }

        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }
        inactivityTimer = setTimeout(() => {
            dispatch(showInfoModal({ 
                header: 'Session Inactive', 
                body: `You've been logged out due to inactivity. Please log back in to resume your session.`, 
                show: true, 
                onClickOkay: () => dispatch(saveSessionAndLogout())
            }));
        }, auth!.config!.inactivityTimeoutMinutes * 1000 * 60);
    }
}

const mapStateToProps = (state: AppState) => {
    return {
        auth: state.auth,
        confirmationModal: state.generalUi.confirmationModal,
        currentRoute: state.generalUi.currentRoute,
        exportState: state.dataExport,
        informationModal: state.generalUi.informationModal,
        noclickModal: state.generalUi.noclickModal,
        routes: state.generalUi.routes,
        sessionContext: state.session.context
    };
};

const mapDispatchToProps = (dispatch: any) => {
    return {
        dispatch
    };
};

export default connect<StateProps, DispatchProps, OwnProps, AppState>
    (mapStateToProps, mapDispatchToProps)(App);
