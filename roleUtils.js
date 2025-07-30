/**
 * Utility functions for role-based access control
 */

/**
 * Check if a user has the Chiefs role
 * @param {Object} interaction - The Discord interaction object
 * @returns {boolean} - Whether the user has the Chiefs role
 */
function hasChiefsRole(interaction) {
    if (!interaction.member || !interaction.member.roles) {
        return false;
    }
    
    const roles = interaction.member.roles.cache;
    return roles.some(role => role.name === "Chiefs");
}

module.exports = {
    hasChiefsRole
};