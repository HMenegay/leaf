-- Copyright (c) 2019, UW Medicine Research IT, University of Washington
-- Developed by Nic Dobbins and Cliff Spital, CRIO Sean Mooney
-- This Source Code Form is subject to the terms of the Mozilla Public
-- License, v. 2.0. If a copy of the MPL was not distributed with this
-- file, You can obtain one at http://mozilla.org/MPL/2.0/.
﻿USE [LeafDB]
GO
/****** Object:  UserDefinedFunction [app].[fn_FilterConceptsByConstraint]    Script Date: 3/29/19 11:06:42 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =======================================
-- Author:      Cliff Spital
-- Create date: 2018/10/24
-- Description: Recursively (ancestry applies) filters a list of concept ids by ConceptConstraint relationships.
-- =======================================
CREATE FUNCTION [app].[fn_FilterConceptsByConstraint]
(
    @user auth.[User],
    @groups auth.GroupMembership READONLY,
    @requested app.ResourceIdTable READONLY
)
RETURNS @allowed TABLE (
    [Id] [uniqueidentifier] NULL
)
AS
BEGIN
    DECLARE @ancestry table
    (
        [Base] [uniqueidentifier] not null,
        [Current] [uniqueidentifier] not null,
        [Parent] [uniqueidentifier] null
    );

    -- Fetch the full ancestry of all requested Ids.
    WITH recRoots (Base, Id, ParentId) as
    (
        SELECT i.Id, i.Id, c.Parentid
        FROM @requested i
        JOIN app.Concept c on i.Id = c.Id

        UNION ALL

        SELECT r.Base, c.Id, c.ParentId
        FROM app.Concept c
        JOIN recRoots r on c.Id = r.ParentId
    )
    INSERT INTO @ancestry
    SELECT Base, Id, ParentId
    FROM recRoots;

    -- Identify any requested Ids that are disallowed by constraint anywhere in their ancestry.
    DECLARE @disallowed app.ResourceIdTable;
    INSERT INTO @disallowed
    SELECT DISTINCT
        a.Base
    FROM @ancestry a
    JOIN auth.ConceptConstraint c on a.[Current] = c.ConceptId and c.ConstraintId = 1 -- User Constrained
    WHERE @user NOT IN (
        SELECT ConstraintValue
        FROM auth.ConceptConstraint
        WHERE ConceptId = c.ConceptId
        AND c.ConstraintId = 1
    )
    UNION
    SELECT DISTINCT
        a.Base
    FROM @ancestry a
    JOIN auth.ConceptConstraint c on a.[Current] = c.ConceptId and c.ConstraintId = 2 -- Group Constrained
    WHERE NOT EXISTS (
        SELECT 1 FROM @groups WHERE [Group] = c.ConstraintValue
    );

    -- Select only the allowed requested ids.
    INSERT INTO @allowed
    SELECT Id
    FROM @requested
    WHERE Id NOT IN (
        SELECT Id
        FROM @disallowed
    );
    RETURN;
END






GO
