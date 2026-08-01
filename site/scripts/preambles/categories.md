A category is an envelope you assign money to — rent, groceries, the vacation fund — with a
budgeted amount, activity, and balance for a given month. Categories live inside category groups.
Two tools here operate on a specific month (`update_category_budget`, `get_month_category`); the
rest operate on the category's own record. Note: the YNAB API has no endpoint for reordering
categories within a group, so no tool here can do that either.
