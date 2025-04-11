#!/usr/bin/env ts-node

import {query} from '../db/db'

function cleanDb() {
    query(`DELETE FROM redacted_screenshots`);
    query(`DELETE FROM events`);
    query(`DELETE FROM screenshots`);
    query(`DELETE FROM sessions`);
}

cleanDb();